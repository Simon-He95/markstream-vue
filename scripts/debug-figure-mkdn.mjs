import { getMarkdown } from '../src/utils/markdown/getMarkdown.js'

const md = getMarkdown({})
const content = '**Figure: Markstream logo (served from /vue-markdown-icon.svg)**'
const tokens = md.parse(content, {})
console.log('parsed tokens count', tokens.length)
if (tokens[1] && tokens[1].children) {
  console.log('inline children length', tokens[1].children.length)
  console.log(JSON.stringify(tokens[1].children, null, 2))
}
