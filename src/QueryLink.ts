/* eslint-disable class-methods-use-this */
import { database as FDatabase } from 'firebase'
import { hasDirectives, getOperationName, getQueryDefinition } from 'apollo-utilities'
import { ApolloLink, Operation, NextLink, Observable, FetchResult } from 'apollo-link'

import { parseGqlQuery } from './parser'
import { executeFirebaseTree } from './transformer'

import { observeAll } from './common'

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

    const executedTree = executeFirebaseTree({
      database: this.database,
      operation,
      operationName,
      tree: firebaseQuery,
      operationType: 'query',
    })

    const executedTreeObservable = observeAll(executedTree.map(item => item.observable))

    return new Observable(observer => {
      executedTreeObservable.subscribe({
        next(value) {
          console.log('next', value)
        },
        error(err) {
          console.error('err', err)
        },
        complete() {
          console.log('complete')
        },
      })
      executedTree.forEach(item => {
        if (item.observable != null) {
          console.log('subscribing')
          item.observable.subscribe(
            value => {
              console.log('value', value)
            },
            error => {
              console.error('error', error)
            },
            () => {
              console.log('complete')
            },
          )
        }
      })
      // observer.error(new Error('test'))
      return () => {
        // Unsubscribe
      }
    })
  }
}
