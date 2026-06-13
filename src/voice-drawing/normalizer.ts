const replacements: Array<[RegExp, string]> = [
  [/兰色/g, '蓝色'],
  [/圆圈|圈圈/g, '圆形'],
  [/方块|长方形/g, '矩形'],
  [/删掉|去掉/g, '删除'],
  [/退回上一步|返回上一步/g, '撤销'],
  [/恢复上一步/g, '重做'],
  [/这个|它/g, '刚才那个'],
  [/，/g, ','],
  [/。/g, ''],
]

export function normalizeCommand(text: string) {
  return replacements.reduce((value, [pattern, next]) => value.replace(pattern, next), text.trim())
}
