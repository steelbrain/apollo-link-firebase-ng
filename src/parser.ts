import { Operation } from 'apollo-link'
import { OperationDefinitionNode, SelectionNode, ArgumentNode, FragmentDefinitionNode } from 'graphql/language/ast'

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
  fragmentsMap,
}: {
  selection: SelectionNode
  operation: Operation
  fragmentsMap: Map<string, FragmentDefinitionNode>
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
    import: getDirectiveValue({
      operation,
      selection,
      name: 'import',
      value: 'from',
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
    type: getDirectiveValue({
      operation,
      selection,
      name: 'firebase',
      value: 'type',
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

  if (firebaseNode.variables.ref != null && typeof firebaseNode.type !== 'string') {
    throw new Error(`Missing type parameter in firebase directive`)
  }

  if (selection.selectionSet != null) {
    selection.selectionSet.selections.forEach(childSelection => {
      let selections: SelectionNode[] | ReadonlyArray<SelectionNode>
      if (childSelection.kind === 'FragmentSpread') {
        const fragmentName = childSelection.name.value
        const fragment = fragmentsMap.get(fragmentName)
        if (fragment == null) {
          throw new Error(`Fragment '${fragmentName}' not found`)
        }

        selections = fragment.selectionSet.selections
      } else if (childSelection.kind === 'InlineFragment') {
        selections = childSelection.selectionSet.selections
      } else {
        selections = [childSelection]
      }

      selections.forEach(childSelectionItem => {
        const childFirebaseNode = processGqlSelection({
          operation,
          selection: childSelectionItem,
          fragmentsMap,
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
    })
  }

  return firebaseNode
}

function parseGqlQuery({ operation, query }: { operation: Operation; query: OperationDefinitionNode }) {
  const tree: FirebaseNode[] = []
  const fragmentsMap: Map<string, FragmentDefinitionNode> = new Map()

  operation.query.definitions.forEach(item => {
    if (item.kind !== 'FragmentDefinition') {
      return
    }

    fragmentsMap.set(item.name.value, item)
  })

  query.selectionSet.selections.forEach(selection => {
    const firebaseNode = processGqlSelection({
      operation,
      selection,
      fragmentsMap,
    })
    if (firebaseNode != null) {
      tree.push(firebaseNode)
    }
  })

  return tree
}

export { parseGqlQuery }
