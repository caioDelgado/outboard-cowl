const { Namespace } = require('api-elements')
const { uniqBy, reject, isEmpty, values } = require('lodash')
const {
  toValue,
  toTitle,
  toDescription,
  toTag,
  digDataStructure,
  digTransitions
} = require('./apib/parser')

const drafter = require('drafter.js')

const aglioBasedDrafter = require('drafter')

const mediaTypes = ['text/vnd.apiblueprint']
const namespace = new Namespace()

const detect = function (media) {
  return mediaTypes.indexOf(media) !== -1
}

const load = async function (source, options = {}) {
  let refract

  refract = await drafter.parse(source, options)

  const schema = aglioBasedDrafter.parseSync(source, options)

  let newSchema = {}
  schema.content.map(({ content }) => {
    content.filter(({ element }) => element === 'category')
      .forEach(({ content: category }) => {
        return category.filter(({ element }) => element === 'resource')
          .forEach(({ content: resource }) => {
            const transition = resource.find(({ element }) => element === 'transition')

            const responseHttp = transition
              .content.find(({ element }) => element === 'httpTransaction')
              .content.find(({ element }) => element === 'httpResponse')
              .content[2]

            newSchema[transition.meta.title] = responseHttp
          })
      })
  })

  refract.content.filter(({ element }) => element === 'category')
    .forEach(({ content: categories }) => {
      categories.filter(({ element }) => element === 'category')
        .forEach(({ content: category }) => {
          category.filter(({ element }) => element === 'resource')
            .forEach(({ content: resource }) => {
              const selectedResource = resource.find(({ element }) => element === 'transition')

              const [ dataStructure, body, schema ] = selectedResource.content.find(({ element }) => element === 'httpTransaction')
                .content.find(({ element }) => element === 'httpResponse')
                .content

              schema.content = newSchema[selectedResource.meta.title.content].content

              selectedResource.content.find(({ element }) => element === 'httpTransaction')
                .content.find(({ element }) => element === 'httpResponse')
                .content = [
                  dataStructure,
                  body,
                  schema
                ]
            })
        })
    })

  let _namespace = namespace.fromRefract(refract)

  return _namespace
}

const loadStrict = async function (source, options = {}) {
  const result = await load(source, options)
  const warnings = lintResult(result)

  if (warnings.length >= 1) {
    const warningText = warnings
      .map(warning => annotationString(warning))
      .join('\n')

    throw new Error(warningText)
  }

  return result
}

const lint = async function (source, options = {}) {
  const result = await load(source, options)
  return lintResult(result)
}

const lintResult = result => {
  return result.annotations.map(el => {
    const index = reject(
      el.attributes
        .findRecursive('number')
        .map(item => values(item.attributes.toValue())),
      isEmpty
    )

    return {
      location: index.map(arr => ({ line: arr[0], column: arr[1] })),
      severity: el.classes.toValue().join(' '),
      description: el.content
    }
  })
}

const annotationString = annotation => {
  const locations = annotation.location
    .map(loc => `line ${loc.line}, column ${loc.column}`)
    .join('')

  return `${annotation.description} (${annotation.severity}: ${locations})`
}

const title = function (elements) {
  return toTitle(elements.api)
}

const description = function (elements) {
  return toDescription(elements.api)
}

// eslint-disable-next-line no-unused-vars
const version = function (elements) {
  return ''
}

const servers = function (elements) {
  const attrs = toValue(elements.api.attributes) || {}
  const { metadata = [] } = attrs

  return metadata
    .filter(meta => meta.key === 'HOST')
    .map(meta => ({ url: meta.value }))
}

const tags = function (elements) {
  const items = []

  elements.api.resourceGroups.forEach(group => {
    const children = []

    group.resources.forEach(resource => {
      children.push(toTag(resource))
    })

    items.push(toTag(group, children))
  })

  elements.api.resources.forEach(resource => {
    items.push(toTag(resource))
  })

  return uniqBy(items, 'title')
}

const structures = function (elements) {
  const items = []

  elements.api.dataStructures.forEach(dataStructures => {
    dataStructures.forEach(dataStructure => {
      items.push(digDataStructure(dataStructure))
    })
  })

  elements.api.resourceGroups.forEach(group => {
    group.resources.forEach(resource => {
      items.push(digDataStructure(resource.dataStructure))
    })
  })

  elements.api.resources.forEach(resource => {
    items.push(digDataStructure(resource.dataStructure))
  })

  return items.filter(item => item)
}

const fixDuplicateSlugs = function (items) {
  const slugs = items.map(action => action.slug)
  const obj = {}

  slugs.forEach((slug, index) => {
    if (!(slug in obj)) {
      obj[slug] = []
    }

    obj[slug].push(index)
  })

  return items.map((item, index) => {
    var idx = obj[item.slug].indexOf(index)

    if (idx === 0) {
      return item
    }

    item.slug = `${item.slug}~${idx + 1}`
    return item
  })
}

const actions = function (elements) {
  const items = []

  elements.api.resourceGroups.forEach(group => {
    group.resources.forEach(resource => {
      digTransitions(resource, group).forEach(action => {
        items.push(action)
      })
    })
  })

  elements.api.resources.forEach(resource => {
    digTransitions(resource).forEach(action => {
      items.push(action)
    })
  })

  return fixDuplicateSlugs(items)
}

module.exports = {
  parse: drafter.parse,
  validate: drafter.validate,

  detect,
  load,
  loadStrict,
  lint,

  title,
  description,
  version,
  servers,
  tags,
  structures,
  actions
}
