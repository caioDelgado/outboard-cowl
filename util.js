const getSlug = require('speakingurl')
const { sortBy, isEmpty, isEqual, merge } = require('lodash')

const toSlug = str => {
  return getSlug(str, {
    separator: '~',
    custom: { _: '~' }
  })
}

const tagMap = (tags, actions, { sortTags = true }) => {
  let itemTags = [...tags]

  if (sortTags) {
    itemTags = sortBy(itemTags, 'title')
  }

  return itemTags.map(tag => {
    if (isEmpty(tag.children)) {
      tag = { title: undefined, description: '', children: [tag] }
    }

    let childrenTags = [...tag.children]

    if (sortTags) {
      childrenTags = sortBy(childrenTags, 'title')
    }

    return {
      title: tag.title,
      children: childrenTags.map(child => {
        return {
          title: child.title,
          actions: actions
            .filter(action => {
              return isEqual(
                toSlug(action.tags.join('/')),
                toSlug([tag.title, child.title].join('/'))
              )
            })
            .map(action => {
              return {
                title: action.title,
                method: action.method,
                path: action.path,
                slug: action.slug
              }
            })
        }
      })
    }
  })
}

const expandStructure = function (structure, items) {
  if (!structure) {
    return
  }

  if ('schema' in structure) {
    if (structure.schema.type) {
      const expanded = merge({ members: [] }, structure)

      const item = items.find(item => item.id === structure.schema.type)

      if (item) {
        const nested = expandStructure(item, items)

        for (let member of nested.members) {
          expanded.members.push(expandStructure(member, items))
        }
      }

      for (let [i, member] of expanded.members.entries()) {
        expanded.members[i] = expandStructure(member, items)
      }

      return expanded
    }
  }

  if (structure.id) {
    const expanded = merge({ members: [] }, structure)

    const item = items.find(m => m.id === structure.id)
    if (item) {
      const nested = expandStructure(item, items)

      for (let [i, member] of nested.members.entries()) {
        expanded.members[i] = expandStructure(member, items)
      }
    }

    return expanded
  }

  if (structure.ref) {
    const expanded = merge({ members: [] }, structure)

    const item = items.find(m => m.id === structure.ref)

    if (item) {
      const nested = expandStructure(item, items)

      for (let [i, member] of nested.members.entries()) {
        expanded.members[i] = expandStructure(member, items)
      }
    }

    return expanded
  }

  if (structure.constructor && structure.constructor.name === 'Array') {
    return structure.map(item => {
      return expandStructure(item, items)
    })
  }

  return structure
}

// taken from https://github.com/kminami/apib2swagger/blob/v1.8.0/index.js#L62
const swaggerPathName = function (uriTemplate) {
  var params = {}

  for (var i = 0; i < uriTemplate.expressions.length; i++) {
    var exp = uriTemplate.expressions[i]

    if (!exp.varspecs) continue
    if (exp.operator.symbol === '?') continue

    for (var j = 0; j < exp.varspecs.length; j++) {
      var spec = exp.varspecs[j]
      params[spec.varname] = '{' + spec.varname + '}'
    }
  }

  return decodeURIComponent(uriTemplate.expand(params))
}

module.exports = {
  toSlug,
  tagMap,
  expandStructure,
  swaggerPathName
}
