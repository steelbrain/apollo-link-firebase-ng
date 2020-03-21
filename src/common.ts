import { Observable } from 'apollo-link'

function observeAll<T>(observables: Observable<T>[]): Observable<T[]> {
  return new Observable(observer => {
    const { length } = observables
    const itemsComplete = new Set()
    const itemsValues: Map<number, T> = new Map()

    const subscriptions = observables.map((observable, idx) =>
      observable.subscribe({
        next(value) {
          itemsValues.set(idx, value)

          if (itemsValues.size === length) {
            observer.next(Array.from(itemsValues.values()))
          }
        },
        complete() {
          itemsComplete.add(idx)

          if (itemsComplete.size === length) {
            observer.complete()
          }
        },
        error(err) {
          observer.error(err)
        },
      }),
    )

    return () => {
      subscriptions.forEach(item => {
        item.unsubscribe()
      })
    }
  })
}

export { observeAll }
