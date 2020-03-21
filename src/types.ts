import { Observable } from 'apollo-link'

export interface FirebaseNode {
  name: string
  parent: FirebaseNode | null

  ref: string | null
  export: string | null
  key: boolean | null
  value: boolean | null
  array: boolean | null

  children: FirebaseNode[]

  orderByChild: string | null
  orderByKey: boolean | null
  orderByValue: boolean | null
  limitToFirst: number | null
  limitToLast: number | null
  startAt: any | null
  endAt: any | null
  equalTo: any | null
}

export type FirebaseNodeTransformed = FirebaseNode & {
  ref: string | null
  parent: FirebaseNodeExecutable | null
  parentValue: any | null
  parentIndex: number | null
}

export type FirebaseNodeExecutable = FirebaseNodeTransformed & {
  databaseSnapshot: any
  databaseValue: any
  observable: Observable<any>
}

export interface FirebaseValue {
  __key: string | null
  __value: any
}

export type OperationType = 'query' | 'subscribe'
