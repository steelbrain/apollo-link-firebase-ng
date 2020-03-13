/* eslint-disable class-methods-use-this */

import { database as FDatabase } from 'firebase'
import { ApolloLink, Operation, NextLink, Observable, FetchResult } from 'apollo-link'

export default class SubscriptionLink extends ApolloLink {
  database: FDatabase.Database
  constructor({ database }: { database: FDatabase.Database }) {
    super()
    this.database = database
  }
  public request(operation: Operation, forward: NextLink): Observable<FetchResult> {
    return new Observable(observer => {
      observer.next({ test: { ha: 'yes' } })
      // observer.error(new Error('test'))
      observer.complete()
      return () => {
        // Unsubscribe
      }
    })
  }
}
