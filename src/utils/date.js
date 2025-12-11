/**
 * 全局 Day.js 工具库
 * 统一配置所有 Day.js 插件，避免在各个文件中重复引入
 * 解决时区、周计算、季度等常见问题
 */

import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'
import isBetween from 'dayjs/plugin/isBetween.js'
import quarterOfYear from 'dayjs/plugin/quarterOfYear.js'
import isoWeek from 'dayjs/plugin/isoWeek.js'
import weekOfYear from 'dayjs/plugin/weekOfYear.js'
import advancedFormat from 'dayjs/plugin/advancedFormat.js'
import customParseFormat from 'dayjs/plugin/customParseFormat.js'
import 'dayjs/locale/zh-cn.js'

// 扩展插件
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(isBetween)
dayjs.extend(quarterOfYear)
dayjs.extend(isoWeek)
dayjs.extend(weekOfYear)
dayjs.extend(advancedFormat)
dayjs.extend(customParseFormat)

// 设置中文语言和东八区时区
dayjs.locale('zh-cn')
dayjs.tz.setDefault('Asia/Shanghai')

export default dayjs
