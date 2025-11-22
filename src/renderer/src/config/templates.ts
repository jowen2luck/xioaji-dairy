export type TemplateSpec = {
  labelMap?: Record<string, string>
  order?: string[]
  hidden?: string[]
}

export const TEMPLATES: Record<string, TemplateSpec> = {
  // 针对检索记录工具的字段友好别名与显示顺序
  search_records: {
    labelMap: {
      time: '时间',
      shanggexiangmu: '上个项目',
      ganshou: '感受',
      chixushijian: '持续时间',
      _id: 'ID'
    },
    order: ['time', 'shanggexiangmu', 'ganshou', 'chixushijian', '_id'],
    hidden: []
  }
}