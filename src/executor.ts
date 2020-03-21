/* eslint-disable no-param-reassign,no-underscore-dangle */

import { database as FDatabase } from 'firebase'
import { Operation, Observable } from 'apollo-link'
import { observeAll } from './common'
import { FirebaseValue, FirebaseNode, FirebaseNodeTransformed, OperationType, FirebaseNodeExecutable } from './types'

function getDatabaseRef({
  database,
  node,
  ref,
}: {
  database: FDatabase.Database
  node: FirebaseNode
  ref: string
}): FDatabase.Reference {
  const databaseRef = database.ref(ref)

  if (node.orderByChild != null) {
    databaseRef.orderByChild(node.orderByChild)
  }
  if (node.orderByKey) {
    databaseRef.orderByKey()
  }
  if (node.orderByValue) {
    databaseRef.orderByValue()
  }
  if (node.limitToFirst != null) {
    databaseRef.limitToFirst(node.limitToFirst)
  }
  if (node.limitToLast != null) {
    databaseRef.limitToLast(node.limitToLast)
  }
  if (node.startAt != null) {
    databaseRef.startAt(node.startAt)
  }
  if (node.endAt != null) {
    databaseRef.endAt(node.endAt)
  }
  if (node.equalTo != null) {
    databaseRef.equalTo(node.equalTo)
  }

  return databaseRef
}

function transformNodes(nodes: FirebaseNode[], parent: FirebaseNodeTransformed['parent']): FirebaseNodeTransformed[] {
  const transformed: FirebaseNodeTransformed[] = []
  const parentValue = parent != null ? parent.databaseValue : null

  nodes.forEach(item => {
    const { ref } = item
    if (Array.isArray(parentValue)) {
      parentValue.forEach((parentValueItem, idx) => {
        transformed.push({
          ...item,
          ref,
          parent,
          parentValue: parentValueItem,
          parentIndex: idx,
        })
      })
    } else {
      transformed.push({
        ...item,
        ref,
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

  let value: FirebaseValue[]

  if (Array.isArray(snapshot)) {
    value = snapshot.map(__value => ({
      __key: null,
      __value,
    }))
  } else {
    value = Object.keys(snapshot).map(key => ({
      __key: key,
      __value: snapshot[key],
    }))
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
  const { ref } = node

  const executableNode: FirebaseNodeExecutable = {
    ...node,
    observable: null as any,
    databaseSnapshot: null,
    databaseValue: null,
  }

  let observable: Observable<any>

  if (ref != null) {
    observable = new Observable(observer => {
      const databaseRef = getDatabaseRef({
        database,
        node,
        ref,
      })

      const valueSubscription: ZenObservable.Subscription[] = []

      function handleCleanup() {
        valueSubscription.forEach(item => {
          item.unsubscribe()
        })
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

        valueSubscription.push(
          valueObservable.subscribe({
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
          }),
        )
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
