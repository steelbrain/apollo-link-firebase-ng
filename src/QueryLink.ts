/* eslint-disable class-methods-use-this */
import { database as FDatabase } from 'firebase'
import { hasDirectives, getOperationName, getOperationDefinition } from 'apollo-utilities'
import { ApolloLink, Operation, NextLink, Observable, FetchResult } from 'apollo-link'

import parse from './parse'
import execute from './execute'

export default class QueryLink extends ApolloLink {
  database: FDatabase.Database
  constructor({ database }: { database: FDatabase.Database }) {
    super()
    this.database = database
  }
  public request(operation: Operation, forward: NextLink): Observable<FetchResult> {
    const operationName = getOperationName(operation.query) || 'Unknown'

    if (!hasDirectives(['firebase'], operation.query)) {
      if (forward != null) {
        return forward(operation)
      }
      throw new Error(`Missing @firebase directive for Operation: ${operationName}`)
    }

    const query = getOperationDefinition(operation.query)
    if (query == null || query.operation !== 'query') {
      if (forward != null) {
        return forward(operation)
      }
      throw new Error(`Unsupported operation in FirebaseQueryLink`)
    }

    const firebaseQuery = parse({
      operation,
      query,
    })

    return new Observable(observer => {
      const response = execute({
        database: this.database,
        operation,
        operationName,
        nodes: firebaseQuery,
        parentValue: null,
        context: { exports: {}, parent: null },
        operationType: 'query',
        cache: new Map(),
        onValue(data) {
          observer.next({ data })
          observer.complete()
        },
      })
      return response.cleanup
    })
  }
}
