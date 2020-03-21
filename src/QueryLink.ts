/* eslint-disable class-methods-use-this */
import { database as FDatabase } from 'firebase'
import { hasDirectives, getOperationName, getQueryDefinition } from 'apollo-utilities'
import { ApolloLink, Operation, NextLink, Observable, FetchResult } from 'apollo-link'

import { parseGqlQuery } from './parser'
import { executeFirebaseNodes } from './executor'

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

    const query = getQueryDefinition(operation.query)
    if (query.operation !== 'query') {
      if (forward != null) {
        return forward(operation)
      }
      throw new Error(`Unsupported operation in FirebaseQueryLink: ${query.operation}`)
    }

    const firebaseQuery = parseGqlQuery({
      operation,
      query,
    })

    const observable = executeFirebaseNodes({
      database: this.database,
      operation,
      operationName,
      nodes: firebaseQuery,
      parent: null,
      operationType: 'query',
    })

    return new Observable(observer => {
      const subscription = observable.subscribe({
        next(value) {
          observer.next({ data: value })
        },
        error(err) {
          observer.error(err)
        },
        complete() {
          observer.complete()
        },
      })
      return () => {
        subscription.unsubscribe()
      }
    })
  }
}
