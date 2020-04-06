/* eslint-disable no-param-reassign,no-underscore-dangle */

import { database as FDatabase } from 'firebase'
import { Operation } from 'apollo-link'
import { compare } from 'fast-json-patch'

import { FirebaseNode, OperationType, FirebaseVariablesResolved, FirebaseContext } from './types'

function pathExistsInNode(path: string[], node: FirebaseNode, idx: number): boolean {
  if (node.children.length === 0) {
    return true
  }
  if (path[idx] === '__value') {
    return pathExistsInNode(path, node, idx + 1)
  }
  const relevantChild = node.children.find(nodeChild => nodeChild.name === path[idx])
  if (relevantChild) {
    return pathExistsInNode(path, relevantChild, idx + 1)
  }
  return false
}

function hasDatabaseValueChanged({ newValue, oldValue, node }: { newValue: any; oldValue: any; node: FirebaseNode }) {
  let changedForReal = false
  if (Array.isArray(newValue)) {
    changedForReal = newValue.length !== oldValue.length
    if (!changedForReal) {
      for (let i = 0, { length } = newValue; i < length; i += 1) {
        const diff = compare(oldValue[i], newValue[i])
        changedForReal = diff.some(item => pathExistsInNode(item.path.split('/'), node, 1))
        if (changedForReal) {
          break
        }
      }
    }
  } else {
    const diff = compare(oldValue, newValue)
    changedForReal = diff.some(item => pathExistsInNode(item.path.split('/'), node, 1))
  }

  return changedForReal
}

function resolveExportedName({
  name,
  context,
  operation,
}: {
  name: string
  context: FirebaseContext
  operation: Operation
}) {
  if (typeof context.exports[name] !== 'undefined') {
    return context.exports[name]
  }
  if (context.parent == null) {
    if (typeof operation.variables[name] !== 'undefined') {
      return operation.variables[name]
    }
    return null
  }
  return resolveExportedName({
    name,
    context: context.parent,
    operation,
  })
}

function resolveFirebaseVariableValue({
  value,
  operation,
  context,
}: {
  value: string
  operation: Operation
  context: FirebaseContext
}): string | null {
  if (value == null) {
    return value
  }

  let modified = false
  let resolved: string | null = value.toString()
  let startingIdx = -1
  let endingIdx = -1
  do {
    startingIdx = resolved.indexOf('$')
    endingIdx = resolved.indexOf('$', startingIdx + 1)

    if (startingIdx !== -1 && endingIdx !== -1) {
      modified = true
      const variableName = resolved.slice(startingIdx + 1, endingIdx)
      const variableValue = resolveExportedName({
        name: variableName,
        context,
        operation,
      })
      if (variableValue == null) {
        // If an undefined variable is encountered, dump the whole value
        resolved = null
        break
      } else {
        resolved = `${resolved.slice(0, startingIdx)}${variableValue}${resolved.slice(endingIdx + 1)}`
      }
    }
  } while (startingIdx !== -1 && endingIdx !== -1)

  return modified ? resolved : value
}

function resolveFirebaseVariables({
  node,
  operation,
  context,
}: {
  node: FirebaseNode
  operation: Operation
  context: FirebaseContext
}): FirebaseVariablesResolved {
  const key: string[] = []
  let { ref, orderByChild, startAt, endAt, equalTo } = node.variables
  const { orderByKey, orderByValue, limitToFirst, limitToLast, transformRef } = node.variables

  if (ref != null) {
    ref = resolveFirebaseVariableValue({
      value: ref,
      operation,
      context,
    })
  }
  if (ref != null) {
    key.push(ref)
    if (orderByChild != null) {
      orderByChild = resolveFirebaseVariableValue({
        value: orderByChild,
        operation,
        context,
      })
    }
    key.push(orderByChild == null ? '-' : orderByChild)
    key.push(orderByKey ? 'yes' : 'no')
    key.push(orderByValue ? 'yes' : 'no')
    key.push(limitToFirst == null ? '-' : limitToFirst.toString())
    key.push(limitToLast == null ? '-' : limitToLast.toString())
    if (startAt != null) {
      startAt = resolveFirebaseVariableValue({
        value: startAt,
        operation,
        context,
      })
    }
    key.push(startAt == null ? '-' : startAt)
    if (endAt != null) {
      endAt = resolveFirebaseVariableValue({
        value: endAt,
        operation,
        context,
      })
    }
    key.push(endAt == null ? '-' : endAt)
    if (equalTo != null) {
      equalTo = resolveFirebaseVariableValue({
        value: equalTo,
        operation,
        context,
      })
    }
    key.push(equalTo == null ? '-' : equalTo)
  }

  return {
    key: key.join('$'),
    ref,
    orderByChild,
    orderByValue,
    orderByKey,
    limitToLast,
    limitToFirst,
    startAt,
    endAt,
    equalTo,
    transformRef,
  }
}

function getDatabaseRef({
  database,
  variables,
  cache,
}: {
  database: FDatabase.Database
  variables: FirebaseVariablesResolved
  cache: Map<string, any>
}): FDatabase.Query | FDatabase.Reference {
  const cached = cache.get(variables.key)
  if (cached != null) {
    return cached
  }

  let databaseRef: FDatabase.Query | FDatabase.Reference = database.ref(variables.ref as string)

  if (variables.orderByChild != null) {
    databaseRef = databaseRef.orderByChild(variables.orderByChild)
  }

  if (variables.orderByKey) {
    databaseRef = databaseRef.orderByKey()
  }

  if (variables.orderByValue) {
    databaseRef = databaseRef.orderByValue()
  }

  if (variables.limitToFirst != null) {
    databaseRef = databaseRef.limitToFirst(variables.limitToFirst)
  }

  if (variables.limitToLast != null) {
    databaseRef = databaseRef.limitToLast(variables.limitToLast)
  }

  if (variables.startAt != null) {
    databaseRef = databaseRef.startAt(variables.startAt)
  }

  if (variables.endAt != null) {
    databaseRef = databaseRef.endAt(variables.endAt)
  }

  if (variables.equalTo != null) {
    databaseRef = databaseRef.equalTo(variables.equalTo)
  }

  cache.set(variables.key, databaseRef)

  return databaseRef
}

function transformFirebaseSnapshotValue({ value: snapshotValue, node }: { value: any; node: FirebaseNode }) {
  if (node.children.length === 0 || snapshotValue == null) {
    return snapshotValue
  }

  let value: any

  if (Array.isArray(snapshotValue)) {
    value = snapshotValue.map(__value => ({
      __key: null,
      __value,
    }))
  } else {
    value = { __key: null, __value: snapshotValue }
  }

  return value
}

function transformFirebaseSnapshot({ snapshot, node }: { snapshot: FDatabase.DataSnapshot; node: FirebaseNode }) {
  let value: any
  if (node.array) {
    value = []
    snapshot.forEach(snapshotItem => {
      value.push({
        __key: snapshotItem.key,
        __value: snapshotItem.val(),
      })
    })
  } else {
    value = { __key: null, __value: snapshot.val() }
  }

  return value
}

export default function executeFirebaseNodes({
  database,
  operation,
  operationName,
  nodes,
  parentValue,
  context,
  operationType,
  cache,
  onValue,
}: {
  database: FDatabase.Database
  operation: Operation
  operationName: string
  nodes: FirebaseNode[]
  parentValue: any | null
  context: FirebaseContext
  operationType: OperationType
  cache: Map<string, any>
  onValue: (value: any) => void
}) {
  let setUp = false
  let cleanedUp = false
  let cleanup: (() => void)[] = []
  const result = {
    value: null as any,
    totalRefs: 0,
    loadedRefs: 0,
    cleanup() {
      if (cleanedUp) {
        return
      }
      cleanedUp = true
      cleanup.forEach(cb => {
        cb()
      })
      cleanup = []
    },
  }

  function setNodeValue(node, value, parentIndex) {
    if (parentIndex != null) {
      result.value[parentIndex][node.name] = value
    } else {
      result.value[node.name] = value
    }
  }

  function resolveValueForNode(node, nodeParentValue) {
    if (node.import) {
      return resolveExportedName({
        name: node.import,
        operation,
        context,
      })
    }
    if (node.key) {
      return nodeParentValue.__key
    }
    if (node.value) {
      return nodeParentValue.__value
    }
    if (node.name === '__typename') {
      return node.parent == null ? null : node.parent.type
    }
    if (nodeParentValue.__value == null) {
      return null
    }

    const nodeValue = nodeParentValue.__value[node.name]
    return nodeValue == null ? null : nodeValue
  }

  function processNode(node: FirebaseNode, nodeContext: FirebaseContext, nodeParentValue: any, parentIndex: number | null) {
    let variables: FirebaseVariablesResolved | null = null
    let loaded = false

    function handleValueSet() {
      if (!loaded) {
        loaded = true
        result.loadedRefs += 1
      }
      if (result.loadedRefs === result.totalRefs && setUp) {
        onValue(result.value)
      }
    }

    function handleValueUnset() {
      if (loaded) {
        loaded = false
        result.loadedRefs -= 1
      }
    }

    if (node.variables.ref || typeof node.variables.transformRef === 'function') {
      variables = resolveFirebaseVariables({
        node,
        context: nodeContext,
        operation,
      })
    }

    if (variables != null && typeof variables.transformRef === 'function') {
      variables.ref = variables.transformRef({
        ref: variables.ref,
        parentKey: nodeParentValue.__key,
        parentValue: nodeParentValue.__value,
      })
    }

    if (variables == null || variables.ref == null) {
      const nodeValue = resolveValueForNode(node, nodeParentValue)

      if (nodeValue == null || node.children.length === 0) {
        setNodeValue(node, nodeValue, parentIndex)
        if (node.export) {
          nodeContext.exports[node.export] = nodeValue
        }
        return
      }

      result.totalRefs += 1
      const response = executeFirebaseNodes({
        database,
        operation,
        operationName,
        operationType,
        cache,
        nodes: node.children,
        parentValue: transformFirebaseSnapshotValue({
          node,
          value: nodeValue,
        }),
        context: nodeContext,
        onValue(value) {
          setNodeValue(node, value, parentIndex)
          handleValueSet()
        },
      })
      cleanup.push(() => {
        response.cleanup()
      })

      return
    }
    result.totalRefs += 1

    let lastValue = null
    let lastResult: ReturnType<typeof executeFirebaseNodes> | null = null
    const databaseRef = getDatabaseRef({
      database,
      variables,
      cache,
    })

    function handleValue(snapshot: FDatabase.DataSnapshot) {
      const databaseSnapshot = transformFirebaseSnapshot({
        snapshot,
        node,
      })

      if (databaseSnapshot == null || node.children.length === 0) {
        setNodeValue(node, resolveValueForNode(node, databaseSnapshot), parentIndex)
        handleValueSet()
        return
      }

      if (lastValue != null) {
        if (
          !hasDatabaseValueChanged({
            newValue: databaseSnapshot,
            oldValue: lastValue,
            node,
          })
        ) {
          return
        }
        if (lastResult) {
          lastResult.cleanup()
        }
      }
      lastValue = databaseSnapshot

      handleValueUnset()
      lastResult = executeFirebaseNodes({
        database,
        operation,
        operationName,
        operationType,
        cache,
        nodes: node.children,
        parentValue: databaseSnapshot,
        context: nodeContext,
        onValue(value) {
          setNodeValue(node, value, parentIndex)
          handleValueSet()
        },
      })
    }
    if (operationType === 'query') {
      databaseRef.once('value', handleValue)
    } else {
      databaseRef.on('value', handleValue)
      cleanup.push(() => {
        handleValueUnset()
        databaseRef.off('value', handleValue)
        if (lastResult) {
          lastResult.cleanup()
        }
      })
    }

    if (node.defer) {
      setNodeValue(node, null, parentIndex)
      handleValueSet()
    }
  }

  if (parentValue != null && Array.isArray(parentValue)) {
    result.value = new Array(parentValue.length)
    parentValue.forEach((parentValueItem, parentIndex) => {
      result.value[parentIndex] = {}
      const nodeContext = { exports: {}, parent: context }
      nodes.forEach(node => {
        processNode(node, nodeContext, parentValueItem, parentIndex)
      })
    })
  } else {
    result.value = {}
    const nodeContext = { exports: {}, parent: context }
    nodes.forEach(node => {
      processNode(node, nodeContext, parentValue, null)
    })
  }
  setUp = true

  if (result.loadedRefs === result.totalRefs) {
    onValue(result.value)
  }

  return result
}
