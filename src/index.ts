import { database as FDatabase } from 'firebase'
import { concat, ApolloLink } from 'apollo-link'

import QueryLink from './QueryLink'
import SubscriptionLink from './SubscriptionLink'

export default function createFirebaseLink({ database }: { database: FDatabase.Database }): ApolloLink {
  return concat(
    new QueryLink({
      database,
    }),
    new SubscriptionLink({
      database,
    }),
  )
}
