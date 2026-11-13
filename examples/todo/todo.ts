import { SnapseRoot, type State, component, findState, flush, state, subscribe }
  from 'snapse'
import { type ChildProp, type DOMHandler, button, div, h2, input, output, span }
  from 'snapse/DOM'
import cl from './styles.module.css'

type TodoItem = State<{ id: number, checked: boolean, text: string }>
type TodoListState = State<{
  items: TodoItem[]
  query: string
  selected: number
}>

export const TodoList = component(() => {
  const s = state<TodoListState>({
    items: JSON.parse(localStorage.getItem('ToDo') ?? '[]'),
    query: '',
    selected: 0,
  }, 'TodoList')
  let nextId = Number(s.items.reduce((max, item) => Math.max(max, item.id), 0))
  subscribe(s.items,
    () => localStorage.setItem('ToDo', JSON.stringify(s.items)),
    { deep: true })
  const addTodo: DOMHandler<'change'> = ev => {
    s.items.push({ id: ++nextId, checked: false, text: ev.target.value } as TodoItem)
    ev.target.value = ''
  }
  const matchingItems = s.items.filter(item => String(item.text).includes(s.query))
  const itemComponents = matchingItems.map(todoItem => Todo({ todoItem })
    .or(div({ class: cl.item }, 'Creating...')))

  return div({ class: cl.app },
    div({ class: cl.lists },
      div(
        h2('To do'),
        itemComponents.filter((_item, i) => matchingItems[i]!.checked.not())
          .or(output(s.query.opt(["No match for '", s.query, "'"], 'Nothing to do'))),
      ),
      div({ class: cl.done },
        h2('Done'),
        itemComponents.filter((_item, i) => matchingItems[i]!.checked)
          .or(output(s.query.opt(["No match for '", s.query, "'"], 'Nothing finished'))),
      ),
      input({ class: cl.search, type: 'search', placeholder: 'Search', input: s.query }),
    ),
    div(input({ class: cl.add, placeholder: 'Add todo', change: addTodo })),
  )
})

const startViewTransition = document.startViewTransition?.bind(document)
  ?? ((f: Function) => f())
type TodoItemProps = { todoItem: TodoItem }
const Todo = component(async ({ todoItem }: TodoItemProps) => {
  const s: TodoListState = findState('TodoList')
  const handleCheck: DOMHandler<'change'> = ev => startViewTransition(() => {
    todoItem.checked.set(ev.target.checked)
    flush()
  })
  await new Promise(r => setTimeout(r, 300 + Math.random() * 700)) // Make it expensive

  return div({ class: cl.item, style: { viewTransitionName: `item${todoItem.id}` } },
    input({ type: 'checkbox', checked: todoItem.checked, change: handleCheck }),
    s.selected.is(todoItem.id).opt(
      ItemEditor({ todoItem, todoListState: s }),
      span({ click: () => s.selected.set(todoItem.id) },
        HighlightedText({ text: todoItem.text, highlight: s.query }),
      ),
    ),
  )
})

type ItemEditorProps = { todoItem: TodoItem, todoListState: TodoListState }
const ItemEditor = component(({ todoItem, todoListState: s }: ItemEditorProps) => {
  const updateTodoText: DOMHandler<'change'> = ev => {
    todoItem.text.set(ev.target.value)
    s.selected.set(0)
  }
  const deleteTodo = () => s.items.splice(s.items.indexOf(todoItem), 1)

  return [
    input({ value: todoItem.text, change: updateTodoText, blur: updateTodoText,
      nodeInserted: ev => ev.target?.focus() }),
    button({ class: cl.delete, mousedown: deleteTodo }),
  ]
})

type HighLightedTextProps = State<{ text: string, highlight: string }>
const HighlightedText = component(({ text, highlight }: HighLightedTextProps) =>
  text.split(highlight.or(undefined) as string)
    .reduce((acc, fragment, i) => i
      ? [...acc, span({ class: cl.highlight }, highlight), fragment]
      : [fragment], [] as (string | ChildProp)[]),
)

SnapseRoot(TodoList())
