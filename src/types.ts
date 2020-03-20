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

type FirebaseNodeTransformed = FirebaseNode & {
  _ref?: any
  _value?: any
}
