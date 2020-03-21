/* eslint-disable no-param-reassign,no-underscore-dangle */

import { database as FDatabase } from 'firebase'
import { Operation, Observable } from 'apollo-link'
import { observeAll } from './common'
import { FirebaseNode, FirebaseNodeTransformed, OperationType, FirebaseNodeExecutable, FirebaseVariables } from './types'

function resolveExportedName(name: string, parent: FirebaseNodeTransformed, parentValue: any) {
  for (let i = 0, { length } = parent.children; i < length; i += 1) {
    const child = parent.children[i]
    if (child.export === name) {
      if (child.key) {
        return parentValue.__key
      }
      return parentValue[child.name]
    }
  }

  if (parent.parent) {
    return resolveExportedName(name, parent.parent, parent.parentValue)
  }
  return null
}

function resolveFirebaseVariableValue(
  payload: string | null,
  parent: FirebaseNodeTransformed | null,
  parentValue: any,
): string | null {
  if (parent == null || payload == null) {
    return payload
  }

  let resolved = payload
  let startingIdx = -1
  let endingIdx = -1
  do {
    startingIdx = resolved.indexOf('$')
    endingIdx = resolved.indexOf('$', startingIdx + 1)

    if (startingIdx !== -1 && endingIdx !== -1) {
      const variableName = resolved.slice(startingIdx + 1, endingIdx)
      const variableValue = resolveExportedName(variableName, parent, parentValue)
      resolved = `${resolved.slice(0, startingIdx)}${variableValue}${resolved.slice(endingIdx + 1)}`
    }
  } while (startingIdx !== -1 && endingIdx !== -1)

  return resolved
}

function resolveFirebaseVariables(
  variables: FirebaseVariables,
  parent: FirebaseNodeTransformed | null,
  parentValue: any,
): FirebaseVariables {
  const newVariables: FirebaseVariables = {
    ref: resolveFirebaseVariableValue(variables.ref, parent, parentValue),
    orderByChild: resolveFirebaseVariableValue(variables.orderByChild, parent, parentValue),
    orderByKey: variables.orderByKey,
    orderByValue: variables.orderByValue,
    limitToFirst: variables.limitToFirst,
    limitToLast: variables.limitToLast,
    startAt: resolveFirebaseVariableValue(variables.startAt, parent, parentValue),
    endAt: resolveFirebaseVariableValue(variables.endAt, parent, parentValue),
    equalTo: resolveFirebaseVariableValue(variables.equalTo, parent, parentValue),
  }

  return newVariables
}

function getDatabaseRef({
  database,
  variables,
}: {
  database: FDatabase.Database
  variables: FirebaseVariables
}): FDatabase.Reference {
  const databaseRef = database.ref(variables.ref as string)

  if (variables.orderByChild != null) {
    databaseRef.orderByChild(variables.orderByChild)
  }

  if (variables.orderByKey) {
    databaseRef.orderByKey()
  }

  if (variables.orderByValue) {
    databaseRef.orderByValue()
  }

  if (variables.limitToFirst != null) {
    databaseRef.limitToFirst(variables.limitToFirst)
  }

  if (variables.limitToLast != null) {
    databaseRef.limitToLast(variables.limitToLast)
  }

  if (variables.startAt != null) {
    databaseRef.startAt(variables.startAt)
  }

  if (variables.endAt != null) {
    databaseRef.endAt(variables.endAt)
  }

  if (variables.equalTo != null) {
    databaseRef.equalTo(variables.equalTo)
  }

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
  if (node.children.length === 0) {
    return snapshot
  }

  let value: any

  if (Array.isArray(snapshot)) {
    value = snapshot.map(__value => ({
      __key: null,
      __value,
    }))
  } else if (node.array) {
    value = Object.keys(snapshot).map(key => ({
      __key: key,
      __value: snapshot[key],
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
}: {
  node: FirebaseNodeTransformed
  database: FDatabase.Database
  operation: Operation
  operationName: string
  operationType: OperationType
}): FirebaseNodeExecutable {
  const executableNode: FirebaseNodeExecutable = {
    ...node,
    observable: null as any,
    databaseSnapshot: null,
    databaseValue: null,
  }

  let observable: Observable<any>

  if (node.variables.ref != null) {
    observable = new Observable(observer => {
      const variables = resolveFirebaseVariables(node.variables, node.parent, node.parentValue)
      const databaseRef = getDatabaseRef({
        database,
        variables,
      })

      let valueSubscription: ZenObservable.Subscription | null = null

      function handleCleanup() {
        if (valueSubscription != null) {
          valueSubscription.unsubscribe()
        }
        databaseRef.off()
      }

      function handleValue(firebaseValue) {
        const databaseSnapshot = firebaseValue.val()
        const databaseValue = transformNodeSnapshot({
          snapshot: databaseSnapshot,
          node,
        })

        executableNode.databaseSnapshot = databaseSnapshot
        executableNode.databaseValue = databaseValue

        if (node.children.length === 0) {
          observer.next({
            name: node.name,
            parentIndex: node.parentIndex,
            value: databaseValue,
          })
          if (operationType === 'query') {
            observer.complete()
            handleCleanup()
          }
          return
        }

        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        const valueObservable = executeFirebaseNodes({
          database,
          operation,
          operationName,
          operationType,
          nodes: node.children,
          parent: executableNode,
        })

        valueSubscription = valueObservable.subscribe({
          next(value) {
            observer.next({
              name: node.name,
              parentIndex: node.parentIndex,
              value,
            })
          },
          complete() {
            observer.complete()
          },
          error(err) {
            observer.error(err)
          },
        })
      }

      if (operationType === 'query') {
        databaseRef.once('value', handleValue)
      } else {
        databaseRef.on('value', handleValue)
      }

      return handleCleanup
    })
  } else {
    observable = new Observable(observer => {
      let value = null

      if (node.parentValue != null) {
        if (node.key) {
          value = node.parentValue.__key
        } else if (node.value) {
          value = node.parentValue.__value
        } else {
          value = node.parentValue[node.name]
        }
      }

      observer.next({
        name: node.name,
        parentIndex: node.parentIndex,
        value: value != null ? value : null,
      })
      observer.complete()
    })
  }

  executableNode.observable = observable

  return executableNode
}

function executeFirebaseNodes({
  database,
  operation,
  operationName,
  nodes,
  parent,
  operationType,
}: {
  database: FDatabase.Database
  operation: Operation
  operationName: string
  nodes: FirebaseNode[]
  parent: FirebaseNodeExecutable | null
  operationType: OperationType
}): Observable<any> {
  const transformedNodes = transformNodes(nodes, parent)

  const executableNodes = transformedNodes.map(node =>
    executeFirebaseNode({
      node,
      database,
      operation,
      operationName,
      operationType,
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

export { executeFirebaseNodes }
