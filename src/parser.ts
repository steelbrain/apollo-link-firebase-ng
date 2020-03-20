import { Operation } from 'apollo-link'
import { OperationDefinitionNode, DirectiveNode, SelectionNode } from 'graphql/language/ast'

import { FirebaseNode } from './types'

function getDirectiveValue({
  operation,
  firebaseDirective,
  name,
}: {
  operation: Operation
  firebaseDirective: DirectiveNode
  name: string
}): any | null {
  if (firebaseDirective.arguments == null) {
    return null
  }
  for (let i = 0, { length } = firebaseDirective.arguments; i < length; i += 1) {
    const arg = firebaseDirective.arguments[i]
    if (arg.name.value === name) {
      if (arg.value.kind === 'Variable') {
        const value = operation.variables[arg.value.name.value]
        return value == null ? null : value
      }
      // Only process literal values
      if (
        arg.value.kind === 'BooleanValue' ||
        arg.value.kind === 'StringValue' ||
        arg.value.kind === 'IntValue' ||
        arg.value.kind === 'FloatValue'
      ) {
        return arg.value.value
      }
      return null
    }
  }

  return null
}

function processGqlSelection({
  selection,
  operation,
}: {
  selection: SelectionNode
  operation: Operation
}): FirebaseNode | null {
  if (selection.kind !== 'Field') {
    // TODO: We don't support fragments. Yet.
    return null
  }

  const firebaseDirective =
    selection.directives != null ? selection.directives.find(item => item.name.value === 'firebase') : null

  const firebaseNode: FirebaseNode = {
    name: selection.name.value,
    parent: null,
    ref: firebaseDirective
      ? getDirectiveValue({
          operation,
          firebaseDirective,
          name: 'ref',
        })
      : null,
    export: firebaseDirective
      ? getDirectiveValue({
          operation,
          firebaseDirective,
          name: 'export',
        })
      : null,
    key: firebaseDirective
      ? getDirectiveValue({
          operation,
          firebaseDirective,
          name: 'key',
        })
      : null,
    value: firebaseDirective
      ? getDirectiveValue({
          operation,
          firebaseDirective,
          name: 'value',
        })
      : null,
    array: firebaseDirective
      ? getDirectiveValue({
          operation,
          firebaseDirective,
          name: 'array',
        })
      : null,
    orderByChild: firebaseDirective
      ? getDirectiveValue({
          operation,
          firebaseDirective,
          name: 'orderByChild',
        })
      : null,
    orderByKey: firebaseDirective
      ? getDirectiveValue({
          operation,
          firebaseDirective,
          name: 'orderByKey',
        })
      : null,
    orderByValue: firebaseDirective
      ? getDirectiveValue({
          operation,
          firebaseDirective,
          name: 'orderByValue',
        })
      : null,
    limitToFirst: firebaseDirective
      ? getDirectiveValue({
          operation,
          firebaseDirective,
          name: 'limitToFirst',
        })
      : null,
    limitToLast: firebaseDirective
      ? getDirectiveValue({
          operation,
          firebaseDirective,
          name: 'limitToLast',
        })
      : null,
    startAt: firebaseDirective
      ? getDirectiveValue({
          operation,
          firebaseDirective,
          name: 'startAt',
        })
      : null,
    endAt: firebaseDirective
      ? getDirectiveValue({
          operation,
          firebaseDirective,
          name: 'endAt',
        })
      : null,
    equalTo: firebaseDirective
      ? getDirectiveValue({
          operation,
          firebaseDirective,
          name: 'equalTo',
        })
      : null,
    children: [],
  }

  if (selection.selectionSet != null) {
    selection.selectionSet.selections.forEach(childSelection => {
      const childFirebaseNode = processGqlSelection({
        operation,
        selection: childSelection,
      })
      if (childFirebaseNode != null) {
        childFirebaseNode.parent = firebaseNode
        firebaseNode.children.push(childFirebaseNode)
      }
    })
  }

  return firebaseNode
}

function parseGqlQuery({ operation, query }: { operation: Operation; query: OperationDefinitionNode }) {
  const tree: FirebaseNode[] = []

  query.selectionSet.selections.forEach(selection => {
    const firebaseNode = processGqlSelection({
      operation,
      selection,
    })
    if (firebaseNode != null) {
      tree.push(firebaseNode)
    }
  })

  return tree
}

export { parseGqlQuery }
