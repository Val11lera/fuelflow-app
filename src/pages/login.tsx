export default function Login() {
  return (
    <div className="flex items-center justify-center h-screen">
      <form className="bg-white shadow-md p-8 rounded-md">
        <h2 className="text-xl font-bold mb-4">Client Login</h2>
        <input
          type="email"
          placeholder="Email"
          className="block w-full border p-2 mb-2"
        />
        <input
          type="password"
          placeholder="Password"
          className="block w-full border p-2 mb-4"
        />
        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
        >
          Sign In
        </button>
      </form>
    </div>
  );
}
