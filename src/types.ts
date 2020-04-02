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
  transformRef(args: { ref: string; parentKey: any; parentValue: any }): string | null
}

export type FirebaseVariablesResolved = FirebaseVariables & {
  key: string
}

export interface FirebaseNode {
  name: string
  parent: FirebaseNode | null

  type: string
  export: string | null
  import: string | null
  defer: boolean | null
  key: boolean | null
  value: boolean | null
  array: boolean | null

  children: FirebaseNode[]

  variables: FirebaseVariables
}

export interface FirebaseContext {
  exports: Record<string, any>
  parent: FirebaseContext | null
}

export type OperationType = 'query' | 'subscribe'
