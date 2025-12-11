/**
 * CalendarResolverTool - 生产级时间解析器 (融合优化版)
 * 集成 Dayjs 高级解析能力 + 业务模糊语义 + 范围递归解析
 */

import { Tool, ToolResult } from './base.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import quarterOfYear from 'dayjs/plugin/quarterOfYear.js';
import isoWeek from 'dayjs/plugin/isoWeek.js';
import advancedFormat from 'dayjs/plugin/advancedFormat.js';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';

// 加载插件
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(quarterOfYear);
dayjs.extend(isoWeek);
dayjs.extend(advancedFormat);
dayjs.extend(customParseFormat);

const DEFAULT_TIMEZONE = 'Asia/Shanghai';

export class CalendarResolverTool extends Tool {
  constructor() {
    super();
    this.name = 'calendar_resolver';
    this.description = `生产级时间解析工具。将自然语言转换为精确的 ISO 时间范围。
核心能力：
1. 标准格式：支持 "2023年"、"2023-05"、"Q3"、"20231001" 等
2. 模糊语义："上旬"、"上周工作日"、"周末"、"大前天"
3. 范围表达："11月-12月"、"上周至本周"`;
    
    this.schema = {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '时间表达，如："2023年11月"、"上周至本周"、"Q3"、"最近3天"'
        },
        baseDate: {
          type: 'string',
          description: '基准时间 ISO 格式'
        }
      },
      required: ['query']
    };
  }

  async invoke(input) {
    try {
      const { query, baseDate } = input;
      // 确保基准时间有时区信息
      const base = baseDate ? dayjs(baseDate).tz(DEFAULT_TIMEZONE) : dayjs().tz(DEFAULT_TIMEZONE);
      
      console.log(`[CalendarResolver] Query: "${query}" | Base: ${base.format()}`);

      // 1. 归一化处理
      const normalizedQuery = this.normalizeQuery(query);
      
      // 2. 核心解析
      const result = this.parseLogic(normalizedQuery, base);

      if (!result) {
        return new ToolResult(this.name, {
          error: `无法解析: "${query}"`,
          parsed_as: normalizedQuery,
          suggestions: ['今年', '2025年11月', '上周', '最近7天']
        }, true);
      }

      // 3. 返回结果 + 强制系统提示 (解决死循环的关键)
      return new ToolResult(this.name, {
        original_query: query,
        parsed_query: normalizedQuery,
        ...result,
        // 【关键优化】给 Agent 的强制指令，防止它解析完时间后又去调日历
        system_hint: `✅ 时间已成功解析为 [${result.start} 至 ${result.end}]。不要重复调用解析工具 calendar_resolver，直接调用数据查询工具(query_records/sql_analysis)并将此时间填入 dateRange，或自主重新计算时间。`
      });

    } catch (error) {
      console.error('[CalendarResolver] Error:', error);
      return new ToolResult(this.name, { error: error.message }, true);
    }
  }

  normalizeQuery(query) {
    // 映射规则表
    const replacements = [
      // 1. 口语量词转换
      [/俩/g, '2'],
      [/仨/g, '3'],
      [/半/g, '0.5'], 
      [/几/g, '3'], 

      // 2. 基础汉字数字 (1-9)
      [/[一二三四五六七八九]/g, m => '123456789'['一二三四五六七八九'.indexOf(m)]],

      // 3. "十"的复杂情况 (二十一 -> 21)
      [/(\d)十(\d)/g, '$1$2'], 
      [/(\d)十/g, '$10'],      
      [/十(\d)/g, '1$1'],      
      [/十/g, '10'],           
      [/零/g, '0'],

      // 4. 单位归一化 (关键修改！！！)
      [/(星期|礼拜)/g, '周'],
      // 删除了 [/天|日/g, '天']，防止破坏 "2025年1月1日"
      // 仅将独立的 "日" (表示时长或泛指) 视为 "天"，但日期格式中的 "日" 保留
      // 这里我们可以暂时不处理 "日"->"天"，让 parseLogic 里的正则去兼容 '天' 即可

      // 5. 特殊语义归一化
      [/周(末|尾)/g, '周末'],
      [/周(天|日|0)/g, '周7'], 
      [/整年/g, '全年'],
      
      // 6. 英文连接符标准化 (新增)
      [/\s+to\s+/ig, '至'], // 把 " to " 统一变成 "至"，方便后续分割
    ];

    return replacements.reduce((q, [pattern, replacement]) => {
      return q.replace(pattern, replacement);
    }, query.toLowerCase().trim());
  }

  /**
   * 核心解析逻辑 (层级：范围 -> 标准格式 -> 季度 -> 模糊/业务语义)
   */
  parseLogic(q, base) {
    // ================= 0. 显式范围处理 (Enhanced) =================
    
    // 1. 定义分隔符：
    // 支持：至, 到, ~, 英文to(normalize已转为至), 以及空格包裹的 - (如 2025-01-01 - 2025-02-01)
    // 注意：不单纯匹配 "-"，防止把 2025-01-01 切断
    const rangeSplitters = /至|到|~|(?<=\s)-(?=\s)/;

    // 检查是否包含分隔符
    if (rangeSplitters.test(q)) {
      const parts = q.split(rangeSplitters).map(p => p.trim()).filter(p => p);

      if (parts.length === 2) {
        // [A. 解析开始时间]
        const startRes = this.parseLogic(parts[0], base);

        if (startRes) {
          // [B. 智能上下文推断]
          // 用 startRes.start 作为解析 end 的基准 (处理 "5月1日-3日" 这种情况)
          const smartBase = dayjs(startRes.start).tz(DEFAULT_TIMEZONE);
          let endRes = this.parseLogic(parts[1], smartBase);

          // [C. 跨期/跨年自动修正]
          if (endRes && dayjs(endRes.end).isBefore(dayjs(startRes.start))) {
             const nextYearBase = smartBase.add(1, 'year');
             const retryEndRes = this.parseLogic(parts[1], nextYearBase);

             if (retryEndRes && dayjs(retryEndRes.end).isAfter(dayjs(startRes.start))) {
                endRes = retryEndRes;
             }
          }

          if (endRes) {
            return {
              type: 'range',
              start: startRes.start,
              end: endRes.end,
              description: `范围: ${startRes.description} 至 ${endRes.description}`,
              sql_between: `'${startRes.start}' AND '${endRes.end}'`
            };
          }
        }
      }
    }

    // ================= 1. 优先尝试标准格式解析 (Day.js) =================
    // 这步非常重要，它负责解析 "2025年9月1日" 或 "2025-09-01" 这种原子时间
    const standardRes = this.parseStandardFormats(q, base);
    if (standardRes) return standardRes;

    // ================= 2. 季度处理 =================
    if (q.includes('季度') || /Q[1-4]/i.test(q)) {
        let qNum = null;
        if (/Q1|一|1/.test(q)) qNum = 1;
        else if (/Q2|二|2/.test(q)) qNum = 2;
        else if (/Q3|三|3/.test(q)) qNum = 3;
        else if (/Q4|四|4/.test(q)) qNum = 4;

        if (qNum) {
            let target = base;
            if (q.includes('上') || q.includes('前') || q.includes('去年')) {
               // 简单处理：如果是 "去年Q3"，先减一年
               if (q.includes('去年')) target = target.subtract(1, 'year');
               // 如果是 "上季度"，且当前是Q1，逻辑比较复杂，这里简化为指定季度优先
            }
            target = target.quarter(qNum);
            return this.buildRange(target.startOf('quarter'), target.endOf('quarter'), `${target.year()}年第${qNum}季度`);
        }
        
        // 相对季度
        if (q.includes('本') || q.includes('这')) {
            return this.buildRange(base.startOf('quarter'), base.endOf('quarter'), '本季度');
        }
        if (q.includes('上')) {
            const t = base.subtract(1, 'quarter');
            return this.buildRange(t.startOf('quarter'), t.endOf('quarter'), '上季度');
        }
    }

    // ================= 3. 保留原有的模糊/业务语义 =================
    
    // 3.1 "今年" / "全年"
    if (q === '今年' || q === '本年') return this.buildRange(base.startOf('year'), base, '今年(年初至今)'); // YTD
    if (q === '全年') return this.buildRange(base.startOf('year'), base.endOf('year'), '全年');

    // 3.2 旬 / 月初 / 月底
    if (q.includes('旬')) {
        const isLast = q.includes('上'); // 上个月的旬
        const targetBase = isLast ? base.subtract(1, 'month') : base;
        const y = targetBase.year(), m = targetBase.month();
        if (q.includes('上旬')) return this.buildRange(dayjs(new Date(y, m, 1)), dayjs(new Date(y, m, 10)).endOf('day'), '上旬');
        if (q.includes('中旬')) return this.buildRange(dayjs(new Date(y, m, 11)), dayjs(new Date(y, m, 20)).endOf('day'), '中旬');
        if (q.includes('下旬')) return this.buildRange(dayjs(new Date(y, m, 21)), targetBase.endOf('month'), '下旬');
    }

    // 3.3 工作日 / 周末
    if (q.includes('工作日')) {
        let start = base.startOf('isoWeek');
        if (q.includes('上周')) start = start.subtract(1, 'week');
        // 周一到周五
        return this.buildRange(start, start.add(4, 'day').endOf('day'), '工作日(周一至周五)');
    }
    
    // 3.4 相对天数 (昨/前/明/后)
    const relativeMap = { '昨': -1, '前': -2, '明': 1, '后': 2, '今': 0 };
    for (const [key, val] of Object.entries(relativeMap)) {
        if (q.includes(key + '天') || (key === '昨' && q === '昨天') || (key === '今' && q === '今天')) {
            const target = base.add(val, 'day');
            return this.buildRange(target.startOf('day'), target.endOf('day'), q);
        }
    }

    // 3.5 泛化相对偏移: "过去3天", "未来2周"
    const offsetMatch = q.match(/(过去|最近|未来|前|后)(\d+)(天|周|月|年)/);
    if (offsetMatch) {
        const dir = offsetMatch[1];
        const num = parseInt(offsetMatch[2]);
        const unitMap = { '天': 'day', '周': 'week', '月': 'month', '年': 'year' };
        const unit = unitMap[offsetMatch[3]];
        
        if (['未来', '后'].includes(dir)) {
            return this.buildRange(base, base.add(num, unit), q);
        } else {
            return this.buildRange(base.subtract(num, unit), base, q);
        }
    }

    // 3.6 通用兜底 (上月、下周等)
    if (q.includes('上周')) {
        const t = base.subtract(1, 'week');
        return this.buildRange(t.startOf('isoWeek'), t.endOf('isoWeek'), '上周');
    }
    if (q.includes('上个') && (q.includes('月') || q.includes('month'))) {
        const t = base.subtract(1, 'month');
        return this.buildRange(t.startOf('month'), t.endOf('month'), '上个月');
    }
    if (q.includes('最近')) { // 单独处理 "最近一个月" 这种没数字的
        if (q.includes('月')) return this.buildRange(base.subtract(1, 'month'), base, '最近一个月');
        if (q.includes('周')) return this.buildRange(base.subtract(1, 'week'), base, '最近一周');
    }

    return null;
  }

  /**
   * 优化：利用 Dayjs Parser 解析标准格式
   */
  parseStandardFormats(q, base) {
    const strict = true; 
    
    // 1. 纯年份
    const yearDate = dayjs(q, ['YYYY年', 'YYYY'], strict);
    if (yearDate.isValid() && (q.length === 4 || q.endsWith('年'))) { 
      return this.buildRange(yearDate.startOf('year'), yearDate.endOf('year'), `${yearDate.format('YYYY')}年全年`);
    }

    // 2. 年月
    const monthDate = dayjs(q, ['YYYY年M月', 'YYYY-MM', 'YYYY/MM', 'YYYY.MM'], strict);
    if (monthDate.isValid()) {
      return this.buildRange(monthDate.startOf('month'), monthDate.endOf('month'), monthDate.format('YYYY年M月'));
    }

    // 3. 年月日 (核心修复点：确保支持 YYYY年M月D日)
    const formats = [
        'YYYY年M月D日', // 标准中文
        'YYYY年M月D号', // 口语
        'YYYY-MM-DD',   // ISO
        'YYYY/MM/DD', 
        'YYYY.MM.DD',
        'MM-DD', 
        'M月D日', 
        'M月D号'
    ];
    
    const dayDate = dayjs(q, formats, strict); // 注意：需开启 customParseFormat 插件
    
    if (dayDate.isValid()) {
      let target = dayDate;
      // 修正相对年份 (如只输入 "9月1日"，默认是当年，这通常没问题，除非你需要基于 baseDate)
      // 如果字符串里没年份，且 baseDate 不是今年，可能需要修正 target 的年份
      if (!q.match(/\d{4}/)) {
          target = dayDate.year(base.year());
      }
      return this.buildRange(target.startOf('day'), target.endOf('day'), target.format('YYYY-MM-DD'));
    }
    
    return null;
  }

  buildRange(startObj, endObj, desc) {
    return {
      type: 'range',
      start: startObj.format('YYYY-MM-DD HH:mm:ss'),
      end: endObj.format('YYYY-MM-DD HH:mm:ss'),
      description: desc,
      sql_between: `'${startObj.format('YYYY-MM-DD HH:mm:ss')}' AND '${endObj.format('YYYY-MM-DD HH:mm:ss')}'`
    };
  }
}