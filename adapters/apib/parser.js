const uriTpl = require('uritemplate')
const { toSlug, swaggerPathName } = require('../../util')

const toValue = function (data) {
  try {
    return data && data.toValue()
  } catch (_) {
    return undefined
  }
}

const toRequired = function (element) {
  if (!element) {
    return false
  }

  const attrVal = element.attributes.get('typeAttributes')

  if (attrVal) {
    return toValue(attrVal).includes('required')
  }

  if (element.constructor.name === 'KeyValuePair') {
    const attrs = element.attributes.content.map(c => toValue(c))
    return !!attrs.find(
      at => at.key === 'typeAttributes' && at.value.includes('required')
    )
  }

  return false
}

const toTitle = function (element) {
  return toValue(element.title) || ''
}

const toDescription = function (element) {
  if (!element.copy) return ''
  return toValue(element.copy.get(0)) || ''
}

const toParameter = function ({ key, val, element, location }) {
  const required = toRequired(element)
  const { enumerations } = toValue(
    element.content && element.content.value.attributes
  )

  return {
    location: location,
    name: toValue(key),
    description: toValue(element.description),
    required,
    example: toValue(val),
    schema: {
      type: toTitle(element),
      enum: enumerations
    }
  }
}

const paramLocation = function (key, path) {
  if (path.includes(`{${key}}`)) {
    return 'path'
  }

  return 'query'
}

const toParameters = function (element, path) {
  const { hrefVariables } = element

  if (!hrefVariables) {
    return []
  }

  return hrefVariables.map((val, key, element) =>
    toParameter({
      key,
      val,
      element,
      location: paramLocation(toValue(key), path)
    })
  )
}

const toHeader = function (header) {
  return {
    name: toValue(header.key),
    example: toValue(header.value),
    required: false,
    schema: {
      type: 'string'
    }
  }
}

const toTag = function (element, children) {
  return {
    title: toTitle(element),
    description: toDescription(element),
    children: children || []
  }
}

const toPathTemplate = function (resource, transition) {
  return toValue(transition.computedHref || resource.href)
}

const toPath = function (resource, transition) {
  const href = toPathTemplate(resource, transition)
  return swaggerPathName(uriTpl.parse(href))
}

const digParameters = function (path, resource, transition) {
  const items = []

  toParameters(resource, path).forEach(params => items.push(params))
  toParameters(transition, path).forEach(params => items.push(params))

  return items
}

const digDescriptions = function (resource, transition) {
  return [toDescription(resource), toDescription(transition)].join('\n')
}

const digHeaders = function (headers) {
  return (headers || []).map(header => toHeader(header))
}

const digTags = function (resource, group) {
  const tags = [toTitle(resource)]

  if (group) {
    tags.unshift(toTitle(group))
  }

  return tags
}

const digDataStructureArray = function (dataStructure) {
  return {
    id: toValue(dataStructure.content.meta.get('id')),
    schema: {
      type: dataStructure.content.element
    },
    members: dataStructure.content.map(v => {
      return { id: v.element }
    })
  }
}

const digDataStructureObject = function (dataStructure) {
  return {
    id: toValue(dataStructure.content.meta.get('id')),
    schema: {
      type: dataStructure.content.element
    },
    members: dataStructure.content.map((val, key, member) => {
      let schemaType
      let refs = []

      if (member.content.constructor.name === 'KeyValuePair') {
        schemaType = member.content.value.element

        if (val.element === 'array') {
          refs = val.map(v => {
            if (v.content && v.content.constructor.name === 'Array') {
              return v.content.map(x => {
                if (x.element === 'ref') {
                  return { ref: toValue(x) }
                }
              })
            }
          })
        }

        if (val.element === 'object') {
          refs = val.content.map(x => {
            if (x.element === 'ref') {
              return { ref: toValue(x) }
            }
          })
        }

        refs = refs.filter(r => !!r)
      } else {
        schemaType = member.content
      }

      return {
        key: toValue(key),
        value: toValue(val),
        description: toValue(member.meta.get('description')),
        required: toRequired(member),
        members: refs,
        schema: {
          type: schemaType
        }
      }
    })
  }
}

const digDataStructureGeneric = function (dataStructure) {
  if (!dataStructure.content.content) {
    return {
      id: toValue(dataStructure.content.meta.get('id')),
      schema: {
        type: dataStructure.content.element
      }
    }
  }

  return {
    id: toValue(dataStructure.content.meta.get('id')),
    schema: {
      type: dataStructure.content.element
    },
    members: dataStructure.content.content.map(val => {
      return {
        key: toValue(val.content.key),
        value: toValue(val.content.value),
        description: toValue(val.description),
        required: toRequired(val),
        schema: {
          type: val.content.value.element
        }
      }
    })
  }
}

const digDataStructure = function (dataStructure) {
  if (!dataStructure) {
    return
  }

  if (dataStructure.content.element === 'array') {
    return digDataStructureArray(dataStructure)
  }

  if (dataStructure.content.element === 'object') {
    return digDataStructureObject(dataStructure)
  }

  return digDataStructureGeneric(dataStructure)
}

const transactionPart = function (element) {
  return {
    title: toValue(element.title),
    description: toDescription(element),
    contentType: toValue(element.contentType),
    headers: digHeaders(element.headers),
    structure: digDataStructure(element.dataStructure),
    example: toValue(element.messageBody) || '',
    schema: toValue(element.messageBodySchema) || ''
  }
}

const digTransactions = function (transition) {
  return transition.transactions.map(transaction => {
    const { request, response } = transaction

    return {
      request: transactionPart(request),
      response: Object.assign(
        { statusCode: parseInt(toValue(response.statusCode), 10) },
        transactionPart(response)
      )
    }
  })
}

const transitionTitle = function ({ transition, method, path }) {
  const title = toValue(transition.title)

  if (title !== '') return title
  return `${method.toUpperCase()} ${path}`
}

const digTransitions = function (resource, group = null) {
  return resource.transitions.map(transition => {
    const method = toValue(transition.method || '')
    const path = toPath(resource, transition)
    const pathTemplate = toPathTemplate(resource, transition)

    return {
      title: transitionTitle({ transition, method, path }),
      path,
      pathTemplate,
      slug: toSlug(`${method} ${path}`),
      method: method.toLowerCase(),
      description: digDescriptions(resource, transition),
      parameters: digParameters(path, resource, transition),
      transactions: digTransactions(transition),
      tags: digTags(resource, group)
    }
  })
}

module.exports = {
  toValue,
  toTitle,
  toDescription,
  toTag,
  toPath,
  digDataStructure,
  digTransitions
}
