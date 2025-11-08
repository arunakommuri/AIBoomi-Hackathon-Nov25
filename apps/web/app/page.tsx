export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold mb-4">AIBoomi WhatsApp Bot</h1>
        <p className="text-lg text-gray-600">
          Your WhatsApp webhook is ready! Send a message to your Twilio WhatsApp number to test.
        </p>
      </div>
    </main>
  );
}

