import { SnapseRoot, state } from 'snapse'
import { button } from 'snapse/DOM'

const s = state({ count: 0 })

SnapseRoot(button({ click: () => s.count++ }, 'Clicked ', s.count, ' times'))
