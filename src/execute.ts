/* eslint-disable no-param-reassign,no-underscore-dangle */

import { database as FDatabase } from 'firebase'
import { Operation, Observable } from 'apollo-link'
import { compare } from 'fast-json-patch'

import {
  FirebaseNode,
  FirebaseNodeTransformed,
  OperationType,
  FirebaseNodeExecutable,
  FirebaseVariablesResolved,
} from './types'

function observeAll<T>(observables: Observable<T>[]): Observable<T[]> {
  return new Observable(observer => {
    const { length } = observables
    const itemsComplete = new Set()
    const itemsValues: Map<number, T> = new Map()

    const subscriptions = observables.map((observable, idx) =>
      observable.subscribe({
        next(value) {
          itemsValues.set(idx, value)

          if (itemsValues.size === length) {
            observer.next(Array.from(itemsValues.values()))
          }
        },
        complete() {
          itemsComplete.add(idx)

          if (itemsComplete.size === length) {
            observer.complete()
          }
        },
        error(err) {
          observer.error(err)
        },
      }),
    )

    return () => {
      subscriptions.forEach(item => {
        item.unsubscribe()
      })
    }
  })
}

function pathExistsInNode(path: string[], node: FirebaseNode, idx: number): boolean {
  if (node.children.length === 0) {
    return true
  }
  if (path[idx] === '__value') {
    return false
  }
  const relevantChild = node.children.find(nodeChild => nodeChild.name === path[idx])
  if (relevantChild) {
    return pathExistsInNode(path, relevantChild, idx + 1)
  }
  return false
}

function hasDatabaseValueChanged({
  newValue,
  oldValue,
  node,
}: {
  newValue: any
  oldValue: any
  node: FirebaseNodeTransformed
}) {
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
  node,
  operation,
}: {
  name: string
  node: FirebaseNodeTransformed
  operation: Operation
}) {
  const { parent, parentValue } = node
  if (parent != null) {
    for (let i = 0, { length } = parent.children; i < length; i += 1) {
      const child = parent.children[i]
      if (child.export === name) {
        if (child.key) {
          return parentValue.__key
        }
        if (child.import) {
          // Find the originally exported name
          return resolveExportedName({
            name: child.import,
            node,
            operation,
          })
        }
        return parentValue[child.name]
      }
    }

    if (parent.parent) {
      return resolveExportedName({
        name,
        node: parent,
        operation,
      })
    }
  }

  if (typeof operation.variables[name] !== 'undefined') {
    return operation.variables[name]
  }

  return null
}

function resolveFirebaseVariableValue({
  value,
  node,
  operation,
}: {
  value: string
  node: FirebaseNodeTransformed
  operation: Operation
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
        node,
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
}: {
  node: FirebaseNodeTransformed
  operation: Operation
}): FirebaseVariablesResolved {
  const key: string[] = []
  let { ref, orderByChild, startAt, endAt, equalTo } = node.variables
  const { orderByKey, orderByValue, limitToFirst, limitToLast } = node.variables

  if (ref != null) {
    ref = resolveFirebaseVariableValue({
      value: ref,
      operation,
      node,
    })
  }
  if (ref != null) {
    key.push(ref)
    if (orderByChild != null) {
      orderByChild = resolveFirebaseVariableValue({
        value: orderByChild,
        operation,
        node,
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
        node,
      })
    }
    key.push(startAt == null ? '-' : startAt)
    if (endAt != null) {
      endAt = resolveFirebaseVariableValue({
        value: endAt,
        operation,
        node,
      })
    }
    key.push(endAt == null ? '-' : endAt)
    if (equalTo != null) {
      equalTo = resolveFirebaseVariableValue({
        value: equalTo,
        operation,
        node,
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

function transformNodes(nodes: FirebaseNode[], parent: FirebaseNodeTransformed['parent']): FirebaseNodeTransformed[] {
  const transformed: FirebaseNodeTransformed[] = []
  const parentValue = parent != null ? parent.databaseValue : null

  nodes.forEach(item => {
    if (Array.isArray(parentValue)) {
      parentValue.forEach((parentValueItem, idx) => {
        transformed.push({
          ...item,
          parent,
          parentValue: parentValueItem,
          parentIndex: idx,
        })
      })
    } else {
      transformed.push({
        ...item,
        parent,
        parentValue,
        parentIndex: null,
      })
    }
  })

  return transformed
}

function transformNodeSnapshot({ snapshot, node }: { snapshot: any; node: FirebaseNodeTransformed }) {
  if (node.children.length === 0 || snapshot == null) {
    return snapshot
  }

  let value: any

  if (Array.isArray(snapshot)) {
    value = snapshot.map(__value => ({
      __key: null,
      __value,
      ...__value,
    }))
  } else if (node.array) {
    value = Object.keys(snapshot).map(key => ({
      __key: key,
      __value: snapshot[key],
      ...snapshot[key],
    }))
  } else {
    value = snapshot
  }

  return value
}

function executeFirebaseNode({
  node,
  database,
  operation,
  operationName,
  operationType,
  cache,
}: {
  node: FirebaseNodeTransformed
  database: FDatabase.Database
  operation: Operation
  operationName: string
  operationType: OperationType
  cache: Map<string, any>
}): FirebaseNodeExecutable {
  const executableNode: FirebaseNodeExecutable = {
    ...node,
    observable: null as any,
    databaseSnapshot: null,
    databaseValue: null,
  }

  let observable: Observable<any>

  function processNodeValue(observer: ZenObservable.SubscriptionObserver<any>): ZenObservable.Subscription | null {
    if (node.children.length === 0 || executableNode.databaseValue == null) {
      observer.next({
        name: node.name,
        parentIndex: node.parentIndex,
        value: executableNode.databaseValue,
      })
      if (operationType === 'query') {
        observer.complete()
      }
      return null
    }

    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const valueObservable = executeFirebaseNodes({
      database,
      operation,
      operationName,
      operationType,
      nodes: node.children,
      parent: executableNode,
      cache,
    })

    return valueObservable.subscribe({
      next(value) {
        observer.next({
          name: node.name,
          parentIndex: node.parentIndex,
          value,
        })
      },
      complete() {
        if (operationType === 'query') {
          observer.complete()
        }
      },
      error(err) {
        observer.error(err)
      },
    })
  }

  const variables = resolveFirebaseVariables({
    node,
    operation,
  })

  if (variables.ref != null) {
    observable = new Observable(observer => {
      const databaseRef = getDatabaseRef({
        database,
        variables,
        cache,
      })

      let valueSubscription: ReturnType<typeof processNodeValue> = null

      function handleCleanup() {
        if (valueSubscription != null) {
          valueSubscription.unsubscribe()
        }
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        databaseRef.off('value', handleValue)
      }

      let lastValue: Record<string, any> | null = null
      function handleValue(firebaseValue) {
        const databaseSnapshot = firebaseValue.val()
        const databaseValue = transformNodeSnapshot({
          snapshot: databaseSnapshot,
          node,
        })

        if (lastValue != null && databaseValue != null) {
          if (
            !hasDatabaseValueChanged({
              newValue: databaseValue,
              oldValue: lastValue,
              node,
            })
          ) {
            return
          }
        }
        lastValue = databaseValue

        executableNode.databaseSnapshot = databaseSnapshot
        executableNode.databaseValue = databaseValue

        const newValueSubscription = processNodeValue(observer)
        if (valueSubscription != null) {
          valueSubscription.unsubscribe()
        }
        valueSubscription = newValueSubscription

        if ((node.children.length === 0 || databaseValue == null) && operationType === 'query') {
          handleCleanup()
        }
      }

      if (operationType === 'query') {
        databaseRef.once('value', handleValue)
      } else {
        databaseRef.on('value', handleValue)
      }

      if (node.defer) {
        observer.next({
          name: node.name,
          parentIndex: node.parentIndex,
          value: null,
        })
      }

      return handleCleanup
    })
  } else {
    observable = new Observable(observer => {
      let databaseValue: any = null

      if (node.parentValue != null) {
        if (node.key) {
          databaseValue = node.parentValue.__key
        } else if (node.value) {
          databaseValue = node.parentValue.__value
        } else if (node.import) {
          databaseValue = resolveExportedName({
            name: node.import,
            node,
            operation,
          })
        } else if (node.name === '__typename') {
          databaseValue = node.parent == null ? null : node.parent.type
        } else {
          databaseValue = node.parentValue[node.name]
        }
      }
      executableNode.databaseValue = databaseValue == null ? null : databaseValue

      const valueSubscription = processNodeValue(observer)

      return () => {
        if (valueSubscription != null) {
          valueSubscription.unsubscribe()
        }
      }
    })
  }

  executableNode.observable = observable

  return executableNode
}

export default function executeFirebaseNodes({
  database,
  operation,
  operationName,
  nodes,
  parent,
  operationType,
  cache,
}: {
  database: FDatabase.Database
  operation: Operation
  operationName: string
  nodes: FirebaseNode[]
  parent: FirebaseNodeExecutable | null
  operationType: OperationType
  cache: Map<string, any>
}): Observable<any> {
  const transformedNodes = transformNodes(nodes, parent)

  const executableNodes = transformedNodes.map(node =>
    executeFirebaseNode({
      node,
      database,
      operation,
      operationName,
      operationType,
      cache,
    }),
  )

  const observables = observeAll(executableNodes.map(item => item.observable))

  return new Observable(observer => {
    const subscription = observables.subscribe({
      next(values) {
        let newValue

        if (parent != null && Array.isArray(parent.databaseValue)) {
          newValue = new Array(parent.databaseValue.length)
          for (let i = 0, { length } = newValue; i < length; i += 1) {
            newValue[i] = {}
          }

          values.forEach(entry => {
            newValue[entry.parentIndex][entry.name] = entry.value
          })
        } else {
          newValue = {}
          values.forEach(entry => {
            newValue[entry.name] = entry.value
          })
        }

        observer.next(newValue)
      },
      complete() {
        observer.complete()
      },
      error(err) {
        observer.error(err)
      },
    })

    return () => {
      subscription.unsubscribe()
    }
  })
}
