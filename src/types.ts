import { Observable } from 'apollo-link'

export interface FirebaseVariables {
  ref: string | null
  orderByChild: string | null
  orderByKey: boolean | null
  orderByValue: boolean | null
  limitToFirst: number | null
  limitToLast: number | null
  startAt: any | null
  endAt: any | null
  equalTo: any | null
}

export interface FirebaseNode {
  name: string
  parent: FirebaseNode | null

  export: string | null
  key: boolean | null
  value: boolean | null
  array: boolean | null

  children: FirebaseNode[]

  variables: FirebaseVariables
}

export type FirebaseNodeTransformed = FirebaseNode & {
  parent: FirebaseNodeExecutable | null
  parentValue: any | null
  parentIndex: number | null
}

export type FirebaseNodeExecutable = FirebaseNodeTransformed & {
  databaseSnapshot: any
  databaseValue: any
  observable: Observable<any>
}

export type OperationType = 'query' | 'subscribe'
