export function collect(nodes: any[], type: string) {
  const out: any[] = []
  const walk = (n: any) => {
    if (!n)
      return
    if (Array.isArray(n))
      return n.forEach(walk)
    if (n.type === type)
      out.push(n)
    if (Array.isArray(n.children))
      n.children.forEach(walk)
    if (Array.isArray(n.items))
      n.items.forEach(walk)
    // table nodes store content under header/rows/cells rather than children
    if (n.type === 'table') {
      if (n.header)
        walk(n.header)
      if (Array.isArray(n.rows))
        n.rows.forEach(walk)
    }
    else if (n.type === 'table_row') {
      if (Array.isArray(n.cells))
        n.cells.forEach(walk)
    }
  }
  ;(nodes || []).forEach(walk)
  return out
}

export function hasNode(nodes: any[], type: string) {
  return collect(nodes, type).length > 0
}

export function fenceOrParagraph(nodes: any[]) {
  const fence = hasNode(nodes, 'code_block') || hasNode(nodes, 'fence')
  const para = hasNode(nodes, 'paragraph')
  return fence || para
}

export function isParagraphOrArray(nodes: any[]) {
  return Array.isArray(nodes) || hasNode(nodes, 'paragraph')
}

export function links(nodes: any[]) {
  return collect(nodes, 'link')
}

export function hasLoadingLink(nodes: any[]) {
  const ls = links(nodes) || []
  return ls.some((l: any) => !!l.loading)
}

export function textIncludes(nodes: any[], s: string | RegExp) {
  if (!s)
    return false
  const seen = new Set<any>()
  const walk = (n: any): boolean => {
    if (!n)
      return false
    // allow passing a raw string directly
    if (typeof n === 'string') {
      if (s instanceof RegExp)
        return s.test(n)
      return n.includes(s as string)
    }
    if (seen.has(n))
      return false
    seen.add(n)
    if (Array.isArray(n)) {
      for (const it of n) {
        if (walk(it))
          return true
      }
      return false
    }
    // check common textual fields
    const checkFields = ['content', 'text', 'raw', 'href', 'src', 'title', 'name', 'markup']
    for (const f of checkFields) {
      if (typeof n[f] === 'string') {
        if (s instanceof RegExp) {
          if (s.test(n[f]))
            return true
        }
        else if (n[f].includes(s)) {
          return true
        }
      }
    }
    // also inspect attributes if present (array of [key,value])
    if (Array.isArray(n.attrs)) {
      for (const a of n.attrs) {
        if (Array.isArray(a) && a.length >= 2) {
          const v = String(a[1])
          if (s instanceof RegExp) {
            if (s.test(v))
              return true
          }
          else if (v.includes(s)) {
            return true
          }
        }
      }
    }
    // recurse into children/items
    if (Array.isArray(n.children)) {
      for (const c of n.children) {
        if (walk(c))
          return true
      }
    }
    if (Array.isArray(n.items)) {
      for (const it of n.items) {
        if (walk(it))
          return true
      }
    }
    // table content traversal
    if (n.type === 'table') {
      if (n.header && walk(n.header))
        return true
      if (Array.isArray(n.rows)) {
        for (const r of n.rows) {
          if (walk(r))
            return true
        }
      }
    }
    else if (n.type === 'table_row') {
      if (Array.isArray(n.cells)) {
        for (const c of n.cells) {
          if (walk(c))
            return true
        }
      }
    }
    return false
  }
  try {
    return walk(nodes as any)
  }
  catch {
    return false
  }
}

export function hasParagraph(nodes: any[]) {
  return hasNode(nodes, 'paragraph')
}

export function hasEmoji(nodes: any[]) {
  return collect(nodes, 'emoji').length > 0
}

export function paragraphFirst(nodes: any[]) {
  const ps = collect(nodes, 'paragraph')
  return ps.length > 0 ? ps[0] : null
}

export function paragraphHasCheckbox(nodes: any[]) {
  const p = paragraphFirst(nodes)
  if (!p || !Array.isArray(p.children))
    return false
  return p.children.some((c: any) => c.type === 'checkbox' || c.type === 'checkbox_input')
}
