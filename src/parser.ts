import { Operation } from 'apollo-link'
import { OperationDefinitionNode, SelectionNode, ArgumentNode } from 'graphql/language/ast'

import { FirebaseNode } from './types'

function getArgumentValue({ arg, operation }: { arg: ArgumentNode; operation: Operation }) {
  if (arg.value.kind === 'Variable') {
    const value = operation[arg.value.name.value]
    if (typeof value === 'undefined') {
      throw new Error(`Use of undefined variable: ${arg.value.name.value}`)
    }

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

function getDirectiveValue({
  operation,
  selection,
  name,
  value = null,
}: {
  operation: Operation
  selection: SelectionNode
  name: string
  value?: string | null
}): any | null {
  if (selection.directives == null) {
    return null
  }

  for (let i = 0, { length } = selection.directives; i < length; i += 1) {
    const directive = selection.directives[i]
    if (directive.kind === 'Directive' && directive.name.kind === 'Name') {
      if (directive.name.value === name) {
        if (value == null) {
          return true
        }

        if (directive.arguments == null) {
          return null
        }

        const directiveArg = directive.arguments.find(item => item.kind === 'Argument' && item.name.value === value)

        if (directiveArg == null) {
          return null
        }

        return getArgumentValue({
          arg: directiveArg,
          operation,
        })
      }
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

  const firebaseNode: FirebaseNode = {
    name: selection.name.value,
    parent: null,
    export: getDirectiveValue({
      operation,
      selection,
      name: 'export',
      value: 'as',
    }),
    key: getDirectiveValue({
      operation,
      selection,
      name: 'key',
    }),
    value: getDirectiveValue({
      operation,
      selection,
      name: 'value',
    }),
    array: getDirectiveValue({
      operation,
      selection,
      name: 'array',
    }),

    children: [],

    variables: {
      ref: getDirectiveValue({
        operation,
        selection,
        name: 'firebase',
        value: 'ref',
      }),
      orderByChild: getDirectiveValue({
        operation,
        selection,
        name: 'firebase',
        value: 'orderByChild',
      }),
      orderByKey: getDirectiveValue({
        operation,
        selection,
        name: 'firebase',
        value: 'orderByKey',
      }),
      orderByValue: getDirectiveValue({
        operation,
        selection,
        name: 'firebase',
        value: 'orderByValue',
      }),
      limitToFirst: getDirectiveValue({
        operation,
        selection,
        name: 'firebase',
        value: 'limitToFirst',
      }),
      limitToLast: getDirectiveValue({
        operation,
        selection,
        name: 'firebase',
        value: 'limitToLast',
      }),
      startAt: getDirectiveValue({
        operation,
        selection,
        name: 'firebase',
        value: 'startAt',
      }),
      endAt: getDirectiveValue({
        operation,
        selection,
        name: 'firebase',
        value: 'endAt',
      }),
      equalTo: getDirectiveValue({
        operation,
        selection,
        name: 'firebase',
        value: 'equalTo',
      }),
    },
  }

  if (selection.selectionSet != null) {
    selection.selectionSet.selections.forEach(childSelection => {
      const childFirebaseNode = processGqlSelection({
        operation,
        selection: childSelection,
      })
      if (childFirebaseNode != null) {
        childFirebaseNode.parent = firebaseNode
        if (childFirebaseNode.key || childFirebaseNode.value) {
          // ^ Parent must be an associative array then
          firebaseNode.array = true
        }
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
