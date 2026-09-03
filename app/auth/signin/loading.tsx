export default function SignInLoading() {
  return (
    <main
      aria-label="Cargando inicio de sesión"
      className="grid min-h-screen place-items-center bg-slate-100 px-6"
    >
      <div className="w-full max-w-md animate-pulse space-y-5 bg-white p-10">
        <div className="h-3 w-32 bg-teal-100" />
        <div className="h-10 w-64 bg-slate-200" />
        <div className="h-14 w-full bg-slate-100" />
        <div className="h-14 w-full bg-slate-100" />
        <div className="h-14 w-full bg-slate-300" />
      </div>
    </main>
  );
}
