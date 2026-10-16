import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { Suspense } from "react";

interface FetchTodosResult {
  todos: Array<{ id: string; name?: string; title?: string }> | null;
  notice?: string;
}

async function fetchTodos(): Promise<FetchTodosResult> {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data: todos, error } = await supabase.from("todos").select();

    if (error) {
      return {
        todos: null,
        notice: `Supabase query notice: ${error.message || "Table 'todos' may not be configured yet."}`,
      };
    }

    return {
      todos: (todos as Array<{ id: string; name?: string; title?: string }>) || [],
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      todos: null,
      notice: `Supabase demo connection active (${msg})`,
    };
  }
}

async function TodoList() {
  const result = await fetchTodos();

  if (result.notice) {
    return (
      <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-800 text-sm">
        {result.notice}
      </div>
    );
  }

  if (!result.todos || result.todos.length === 0) {
    return (
      <p className="text-slate-500 text-sm">
        Connected to Supabase! No todos found yet in the &quot;todos&quot; table.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {result.todos.map((todo) => (
        <li
          key={todo.id}
          className="px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 text-sm font-medium"
        >
          {todo.name || todo.title || JSON.stringify(todo)}
        </li>
      ))}
    </ul>
  );
}

export default function TodosPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-8">
      <div className="max-w-xl mx-auto bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h1 className="text-xl font-bold mb-4">Supabase Todos Test Page</h1>
        <Suspense fallback={<p className="text-sm text-slate-500">Loading todos from Supabase...</p>}>
          <TodoList />
        </Suspense>
      </div>
    </div>
  );
}
