import { Operation } from 'apollo-link'
import { FirebaseNode } from './types'

async function executeFirebaseNode({
  operation,
  operationName,
  tree,
}: {
  operation: Operation
  operationName: string
  tree: FirebaseNode[]
}) {
  // Duplicate the entire tree
  const transformedTree = JSON.parse(JSON.stringify(tree))
  debugger
}

export { executeFirebaseNode }
