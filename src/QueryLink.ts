import { database as FDatabase } from 'firebase'
import { ApolloLink } from 'apollo-link'

export default class QueryLink extends ApolloLink {
  database: FDatabase.Database
  constructor({ database }: { database: FDatabase.Database }) {
    super()
    this.database = database
  }
}
