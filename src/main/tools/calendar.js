/**
 * CalendarResolverTool - 生产级时间解析器
 * 将自然语言时间表达转换为精确的 ISO 日期范围
 */

import { Tool, ToolResult } from './base.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import quarterOfYear from 'dayjs/plugin/quarterOfYear.js';
import isoWeek from 'dayjs/plugin/isoWeek.js';
import advancedFormat from 'dayjs/plugin/advancedFormat.js';

// 加载插件
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(quarterOfYear);
dayjs.extend(isoWeek);
dayjs.extend(advancedFormat);

const DEFAULT_TIMEZONE = 'Asia/Shanghai';

export class CalendarResolverTool extends Tool {
  constructor() {
    super();
    this.name = 'calendar_resolver';
    this.description = `生产级时间解析工具。支持模糊语义、口语化表达及特定业务时间段。
特性：
- 区分"今年"(至今)与"全年"
- 支持"上旬/中旬/下旬/工作日"
- 智能推断"周末"归属
- 支持"半个月"、"几天"等模糊量词`;
    
    this.schema = {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '时间表达，如："今年"、"上旬"、"上周工作日"、"大前天"、"过去半年"'
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
      const base = baseDate ? dayjs(baseDate).tz(DEFAULT_TIMEZONE) : dayjs().tz(DEFAULT_TIMEZONE);
      
      console.log(`[CalendarResolver] Query: "${query}" | Base: ${base.format()}`);

      // 1. 归一化 (Pipeline pattern)
      const normalizedQuery = this.normalizeQuery(query);
      
      // 2. 核心解析
      const result = this.parseLogic(normalizedQuery, base);

      if (!result) {
        return new ToolResult(this.name, {
          error: `无法解析: "${query}"`,
          parsed_as: normalizedQuery,
          suggestions: ['今年', '全年', '上旬', '上周工作日', '最近3天']
        }, true);
      }

      return new ToolResult(this.name, {
        original_query: query,
        parsed_query: normalizedQuery,
        ...result
      });

    } catch (error) {
      console.error('[CalendarResolver] Error:', error);
      return new ToolResult(this.name, { error: error.message }, true);
    }
  }

  /**
   * 优化后的预处理逻辑 (Reducer Pattern)
   */
  normalizeQuery(query) {
    // 映射规则表
    const replacements = [
      // 1. 口语量词转换
      [/俩/g, '2'],
      [/仨/g, '3'],
      [/半/g, '0.5'], // 支持小数，配合后续正则 [\d\.]+
      [/几/g, '3'],   // 模糊指代，默认取3，或者交给业务层处理，这里为了闭环设为3
      
      // 2. 基础汉字数字 (1-9)
      [/[一二三四五六七八九]/g, m => '123456789'['一二三四五六七八九'.indexOf(m)]],
      
      // 3. "十"的复杂情况
      [/(\d)十(\d)/g, '$1$2'], // 二十一 -> 21
      [/(\d)十/g, '$10'],      // 二十 -> 20
      [/十(\d)/g, '1$1'],      // 十二 -> 12
      [/十/g, '10'],           // 十 -> 10
      [/零/g, '0'],

      // 4. 单位归一化
      [/(星期|礼拜)/g, '周'],
      [/天|日/g, '天'],
      
      // 5. 特殊语义归一化
      [/周(末|尾)/g, '周末'],
      [/周(天|日|0)/g, '周7'], // ISO标准
      [/整年/g, '全年']
    ];

    return replacements.reduce((q, [pattern, replacement]) => {
      return q.replace(pattern, replacement);
    }, query.toLowerCase().trim());
  }

  /**
   * 核心解析逻辑
   */
  parseLogic(q, base) {
    // ================= A. 绝对年份与"今年"语义区分 =================
    
    // 1. "全年" / "整年" -> 1.1 - 12.31
    if (q.includes('全年')) {
      return this.buildRange(base.startOf('year'), base.endOf('year'), '全年(完整年度)');
    }

    // 2. "今年" -> 1.1 - Now (YTD 逻辑)
    // 必须精确匹配，防止匹配到"今年3月"
    if (q === '今年' || q === '本年') {
      return this.buildRange(base.startOf('year'), base, '今年(年初至今/YTD)');
    }

    // 3. 具体的 "2023年" -> 完整年度
    const absYear = q.match(/^(\d{4})年$/);
    if (absYear) {
      const y = parseInt(absYear[1]);
      const target = base.year(y);
      return this.buildRange(target.startOf('year'), target.endOf('year'), `${y}年全年`);
    }


    // ================= B. 旬/月相与特殊时段 =================

    // 1. 旬 (上旬1-10, 中旬11-20, 下旬21-End)
    if (q.includes('旬')) {
      const isLastMonth = q.includes('上个') || q.includes('上月');
      const targetBase = isLastMonth ? base.subtract(1, 'month') : base;
      const year = targetBase.year();
      const month = targetBase.month(); // 0-11

      if (q.includes('上旬')) return this.buildRange(dayjs(new Date(year, month, 1)), dayjs(new Date(year, month, 10)).endOf('day'), isLastMonth ? '上月上旬' : '本月上旬');
      if (q.includes('中旬')) return this.buildRange(dayjs(new Date(year, month, 11)), dayjs(new Date(year, month, 20)).endOf('day'), isLastMonth ? '上月中旬' : '本月中旬');
      if (q.includes('下旬')) return this.buildRange(dayjs(new Date(year, month, 21)), targetBase.endOf('month'), isLastMonth ? '上月下旬' : '本月下旬');
    }

    // 2. 月初/月底 (模糊定义：月初=1-5号，月底=最后5天)
    if (q.includes('月初')) return this.buildRange(base.startOf('month'), base.startOf('month').add(4, 'day').endOf('day'), '本月初(1-5号)');
    if (q.includes('月底')) return this.buildRange(base.endOf('month').subtract(4, 'day').startOf('day'), base.endOf('month'), '本月底(最后5天)');

    // 3. 工作日 (周一至周五)
    if (q.includes('工作日')) {
      let targetStart = base.startOf('isoWeek'); // 本周一
      
      if (q.includes('上周')) {
        targetStart = base.subtract(1, 'week').startOf('isoWeek');
      } else if (q.includes('下周')) {
        targetStart = base.add(1, 'week').startOf('isoWeek');
      }
      
      // 工作日范围：周一(0) 到 周五(4)
      return this.buildRange(
        targetStart, 
        targetStart.add(4, 'day').endOf('day'), 
        q.includes('上周') ? '上周工作日' : '本周工作日'
      );
    }


    // ================= C. 周末智能推断 =================
    
    // 逻辑：
    // "上周末" -> 明确上周
    // "下周末" -> 明确下周
    // "周末" / "本周末" -> 邻近原则：
    //    如果今天是周1-2，可能还在回味"上周末" (可选策略，这里设定严谨点：周1-2指上周末，周3-5指本周末)
    //    或者简单点：本周的周六日。
    
    if (q.includes('周末')) {
      let targetSat;
      
      if (q.includes('上周末') || q.includes('上个周末')) {
        targetSat = base.subtract(1, 'week').isoWeekday(6);
        return this.buildRange(targetSat.startOf('day'), targetSat.add(1, 'day').endOf('day'), '上周末');
      } 
      
      if (q.includes('下周末')) {
        targetSat = base.add(1, 'week').isoWeekday(6);
        return this.buildRange(targetSat.startOf('day'), targetSat.add(1, 'day').endOf('day'), '下周末');
      }

      // 模糊的 "周末" 或 "这周末"
      // 策略：如果今天是周一(1)或周二(2)，通常语境下用户可能指刚过去的周末。
      // 但如果是 "本周末"，通常指本周即将到来的。
      // 为了减少歧义，"这/本周末" 锁定为本周。
      if (q.includes('本') || q.includes('这')) {
         targetSat = base.isoWeekday(6);
      } else {
         // 纯 "周末"：邻近算法
         const day = base.isoWeekday();
         // 如果是周一(1)或周二(2)，返回上周末；否则返回本周末
         if (day <= 2) {
            targetSat = base.subtract(1, 'week').isoWeekday(6);
         } else {
            targetSat = base.isoWeekday(6);
         }
      }
      
      return this.buildRange(targetSat.startOf('day'), targetSat.add(1, 'day').endOf('day'), '周末(智能推断)');
    }


    // ================= D. 相对日期加强版 =================

    // 1. 大前天/大后天
    if (q.includes('大前天')) return this.buildRange(base.subtract(3, 'day').startOf('day'), base.subtract(3, 'day').endOf('day'), '大前天');
    if (q.includes('大后天')) return this.buildRange(base.add(3, 'day').startOf('day'), base.add(3, 'day').endOf('day'), '大后天');
    
    // 2. 昨天/前天/明天/后天/今天
    if (q.includes('昨天')) return this.buildRange(base.subtract(1, 'day').startOf('day'), base.subtract(1, 'day').endOf('day'), '昨天');
    if (q.includes('前天')) return this.buildRange(base.subtract(2, 'day').startOf('day'), base.subtract(2, 'day').endOf('day'), '前天');
    if (q.includes('明天')) return this.buildRange(base.add(1, 'day').startOf('day'), base.add(1, 'day').endOf('day'), '明天');
    if (q.includes('后天')) return this.buildRange(base.add(2, 'day').startOf('day'), base.add(2, 'day').endOf('day'), '后天');
    if (q.includes('今天')) return this.buildRange(base.startOf('day'), base.endOf('day'), '今天');


    // ================= E. 泛化模式匹配 (支持小数) =================

    // 1. 绝对年月: "2023年5月"
    const absYM = q.match(/(\d{4})[-年](\d{1,2})/);
    if (absYM) {
      const y = parseInt(absYM[1]);
      const m = parseInt(absYM[2]);
      return this.buildRange(base.year(y).month(m - 1).startOf('month'), base.year(y).month(m - 1).endOf('month'), `${y}年${m}月`);
    }

    // 2. 相对偏移: "过去2.5个月", "未来3周"
    // 注意正则中的 [\d\.]+ 支持小数
    const rangeMatch = q.match(/(过去|最近|未来|前|后|下|上)\s*([\d\.]+)\s*(天|周|月|年)/);
    if (rangeMatch) {
      const dirStr = rangeMatch[1];
      const num = parseFloat(rangeMatch[2]); // 支持小数
      const unitStr = rangeMatch[3];
      const unitMap = { '天': 'day', '周': 'week', '月': 'month', '年': 'year' };
      const unit = unitMap[unitStr];

      // 方向标准化
      const isFuture = ['未来', '后', '下'].includes(dirStr);
      
      let start, end;
      if (isFuture) {
        start = base;
        end = base.add(num, unit);
      } else {
        start = base.subtract(num, unit);
        end = base;
      }
      return this.buildRange(start, end, `${dirStr}${num}${unitStr}`);
    }

    // ================= F. 剩余通用词兜底 =================
    
    // 必须放在最后，防止覆盖更具体的逻辑
    if (q.includes('上周')) return this.buildRange(base.subtract(1, 'week').startOf('isoWeek'), base.subtract(1, 'week').endOf('isoWeek'), '上周');
    if (q.includes('本周') || q.includes('这周')) return this.buildRange(base.startOf('isoWeek'), base.endOf('isoWeek'), '本周');
    if (q.includes('下周')) return this.buildRange(base.add(1, 'week').startOf('isoWeek'), base.add(1, 'week').endOf('isoWeek'), '下周');

    if (q.includes('上个月') || q.includes('上月')) return this.buildRange(base.subtract(1, 'month').startOf('month'), base.subtract(1, 'month').endOf('month'), '上个月');
    if (q.includes('本月') || q.includes('这个月')) return this.buildRange(base.startOf('month'), base.endOf('month'), '本月');
    if (q.includes('下个月') || q.includes('下月')) return this.buildRange(base.add(1, 'month').startOf('month'), base.add(1, 'month').endOf('month'), '下个月');
    
    return null;
  }

  buildRange(startObj, endObj, desc) {
    return {
      type: 'range',
      start: startObj.format('YYYY-MM-DD HH:mm:ss'),
      end: endObj.format('YYYY-MM-DD HH:mm:ss'),
      description: desc,
      // 方便下游使用
      sql_between: `'${startObj.format('YYYY-MM-DD HH:mm:ss')}' AND '${endObj.format('YYYY-MM-DD HH:mm:ss')}'`
    };
  }
}

