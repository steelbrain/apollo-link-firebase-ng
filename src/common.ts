import { Operation } from 'apollo-link'
import { OperationDefinitionNode, DirectiveNode, ArgumentNode } from 'graphql/language/ast'

export interface RootAttribute {
  name: string
  ref: string | string[]

  orderByChild: string | null
  orderByKey: boolean | null
  orderByValue: boolean | null
  limitToFirst: number | null
  limitToLast: number | null
  startAt: any | null
  endAt: any | null
  equalTo: any | null
}

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

function getStringDirectiveValue({
  operation,
  operationName,
  firebaseDirective,
  name,
}: {
  operation: Operation
  operationName: string
  firebaseDirective: DirectiveNode
  name: string
}): string | null {
  const value = getDirectiveValue({ operation, firebaseDirective, name })
  if (value == null) {
    return null
  }
  if (typeof value !== 'string') {
    throw new Error(`Invalid non-string value for directive in ${operationName}: ${name}`)
  }
  return value
}
function getBooleanDirectiveValue({
  operation,
  operationName,
  firebaseDirective,
  name,
}: {
  operation: Operation
  operationName: string
  firebaseDirective: DirectiveNode
  name: string
}): boolean | null {
  const value = getDirectiveValue({ operation, firebaseDirective, name })
  if (value == null) {
    return null
  }
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid non-boolean value for directive in ${operationName}: ${name}`)
  }
  return value
}
function getNumberDirectiveValue({
  operation,
  operationName,
  firebaseDirective,
  name,
}: {
  operation: Operation
  operationName: string
  firebaseDirective: DirectiveNode
  name: string
}): number | null {
  const value = getDirectiveValue({ operation, firebaseDirective, name })
  if (value == null) {
    return null
  }
  if (typeof value !== 'number') {
    throw new Error(`Invalid non-number value for directive in ${operationName}: ${name}`)
  }
  return value
}

export function gqlQueryToFirebaseQuery({
  operation,
  operationName,
  query,
}: {
  operation: Operation
  operationName: string
  query: OperationDefinitionNode
}) {
  const rootAttributes: RootAttribute[] = []

  query.selectionSet.selections.forEach(selection => {
    if (selection.kind !== 'Field') {
      // TODO: We don't support fragments. Yet.
      return
    }

    const firebaseDirective =
      selection.directives != null ? selection.directives.find(item => item.name.value === 'firebase') : null
    if (firebaseDirective == null) {
      // Ignore non-firebase selection
      return
    }
    const ref = getDirectiveValue({
      operation,
      firebaseDirective,
      name: 'ref',
    })
    if (typeof ref !== 'string') {
      if (!Array.isArray(ref) || ref.find(item => typeof item !== 'string')) {
        throw new Error(`Invalid value for direction in ${operationName}: ref`)
      }
    }

    const attribute: RootAttribute = {
      name: selection.name.value,
      ref,
      orderByChild: getStringDirectiveValue({
        operation,
        operationName,
        firebaseDirective,
        name: 'orderByChild',
      }),
      orderByKey: getBooleanDirectiveValue({
        operation,
        operationName,
        firebaseDirective,
        name: 'orderByKey',
      }),
      orderByValue: getBooleanDirectiveValue({
        operation,
        operationName,
        firebaseDirective,
        name: 'orderByValue',
      }),
      limitToFirst: getNumberDirectiveValue({
        operation,
        operationName,
        firebaseDirective,
        name: 'limitToFirst',
      }),
      limitToLast: getNumberDirectiveValue({
        operation,
        operationName,
        firebaseDirective,
        name: 'limitToLast',
      }),
      startAt: getDirectiveValue({
        operation,
        firebaseDirective,
        name: 'startAt',
      }),
      endAt: getDirectiveValue({
        operation,
        firebaseDirective,
        name: 'endAt',
      }),
      equalTo: getDirectiveValue({
        operation,
        firebaseDirective,
        name: 'equalTo',
      }),
    }

    rootAttributes.push(attribute)
  })
  debugger
}
