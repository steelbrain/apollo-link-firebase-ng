import { database as FDatabase } from 'firebase'
import { Operation, Observable } from 'apollo-link'
import { FirebaseNode, FirebaseNodeTransformed, OperationType } from './types'

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

function transformNodes(nodes: FirebaseNode[]): FirebaseNodeTransformed[] {
  const transformed: FirebaseNodeTransformed[] = []

  nodes.forEach(item => {
    if (Array.isArray(item.ref)) {
      item.ref.forEach(itemRef => {
        transformed.push({
          ...item,
          ref: itemRef,
          observable: null,
          databaseSnapshot: null,
        })
      })
    } else {
      transformed.push({
        ...item,
        ref: item.ref,
        observable: null,
        databaseSnapshot: null,
      })
    }
  })

  return transformed
}

function executeNonRefNode({
  node,
  database,
  operationType,
}: {
  node: FirebaseNodeTransformed & {
    ref: null
  }
  database: FDatabase.Database
  operationType: OperationType
}) {}

function executeRefNode({
  node,
  database,
  operationType,
}: {
  node: FirebaseNodeTransformed & {
    ref: string
  }
  database: FDatabase.Database
  operationType: OperationType
}) {
  const observable = new Observable(observer => {
    const databaseRef = getDatabaseRef({
      database,
      node,
      ref: node.ref,
    })

    function handleValue(value) {
      node.databaseSnapshot = value.val()

      observer.next(value)
    }

    if (operationType === 'query') {
      databaseRef.once('value', handleValue)
    } else {
      databaseRef.on('value', handleValue)
    }

    return () => {
      databaseRef.off()
    }
  })

  node.observable = observable
}

function executeNode({
  node,
  database,
  operationType,
}: {
  node: FirebaseNodeTransformed
  database: FDatabase.Database
  operationType: OperationType
}) {
  if (node.ref != null) {
    return executeRefNode({ node: node as any, database, operationType })
  }
  return executeNonRefNode({ node: node as any, database, operationType })
}

function executeFirebaseTree({
  database,
  operation,
  operationName,
  tree,
  operationType,
}: {
  database: FDatabase.Database
  operation: Operation
  operationName: string
  tree: FirebaseNode[]
  operationType: OperationType
}): FirebaseNodeTransformed[] {
  const executableTree = transformNodes(tree)

  executableTree.forEach(node =>
    executeNode({
      node,
      database,
      operationType,
    }),
  )

  return executableTree
}

export { executeFirebaseTree }
