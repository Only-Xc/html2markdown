"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import BookShelf from "@/components/books/BookShelf";
import BookWorkspace from "@/components/books/BookWorkspace";

function BookAppContent() {
  const searchParams = useSearchParams();
  const bookId = searchParams.get("bookId");

  if (bookId) {
    return <BookWorkspace bookId={bookId} />;
  }

  return <BookShelf />;
}

export default function BookApp() {
  return (
    <Suspense fallback={<BookShelf />}>
      <BookAppContent />
    </Suspense>
  );
}
