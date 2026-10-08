import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { Suspense } from "react";

async function TodoList() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: todos } = await supabase.from("todos").select();

  if (!todos || todos.length === 0) {
    return (
      <p className="text-slate-500 text-sm">
        Connected to Supabase! No todos found yet in the &quot;todos&quot; table.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {todos.map((todo) => (
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
