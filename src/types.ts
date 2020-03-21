import { Observable } from 'apollo-link'

export interface FirebaseNode {
  name: string
  parent: FirebaseNode | null

  ref: string | string[] | null
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
  observable: Observable<any>
  databaseSnapshot: any | null
}

export type OperationType = 'query' | 'subscribe'
