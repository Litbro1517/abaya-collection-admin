'use client';

import OrdersPillar from '@/components/orders/OrdersPillar';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      <div className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <OrdersPillar />
      </div>
      <footer className="border-t py-4 mt-auto">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between text-xs text-muted-foreground">
          <span>Abaya Collection — Admin</span>
          <span>V4.1.3</span>
        </div>
      </footer>
    </main>
  );
}