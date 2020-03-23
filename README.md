# Apollo Link Firebase

Query/Subscribe to Firebase Realtime DB with GraphQL/Apollo.

### Installation

```
yarn add apollo-link-firebase-ng
# OR
npm install apollo-link-firebase-ng
```

### Setup

Just add the `apollo-link-firebase-ng` package as Link in your Apollo link chain. Here's a minimal example
of the setup:

```js
const client = new ApolloClient({
  link: createFirebaseLink({
    database: firebase.database(),
  }),
  cache: new InMemoryCache({
    addTypename: true,
  }),
})
```

This package can be used in conjuction with other link packages, it only intercepts the queries involving `@firebase`. Please make sure this package appears above the HTTP link package in the chain. Otherwise all requests will go through that package.

### Usage

This package supports Queries and Subscriptions on Firebase resources, eg:

```js
const query = gql`
  fragment Homepage_User on User {
    id
    username
    lastActive
  }
  query {
    users @firebase(ref: "/users/", type: "User") {
      id @key
      ...Homepage_User
    }
    activeUsers @firebase(ref: "/activeUsers", type: "ActiveUser", limitToFirst: 30) {
      id @key @export(as: "userId")
      status @value

      user @firebase(ref: "/users/$userId$", type: "User") {
        id @import(from: "userId")
        ...Homepage_User
      }
    }
  }
`
```

### API

Supported `@firebase` directive arguments:

- `type` - translated to `__typename` for Apollo cache
- `ref` - string
- `orderByChild` string
- `orderByKey` boolean
- `orderByValue` boolean
- `limitToFirst` number
- `limitToLast` number
- `startAt` string
- `endAt` string
- `equalTo` string

Additionally, you can use the following directives:

- `@array` to mark a Firebase value as array. This can turn associative objects into arrays
- `@key` to assign associative object keys to a field value
- `@value` to get raw access to Firebase value
- `@export(as: "fieldName")` to export the value of a field, to be used as variable in another firebase directive
- `@import(from: "fieldName")` to import the value of a sibling or parent exporter of same name
- `@defer` to make parent field resolver despite lack of value on firebase subquery. Be careful with using this on deep arrays, as it'll re-render for each individual item received.

### LICENSE

The contents of this package/repository are licensed under the terms of MIT License. See the LICENSE file for more info.
