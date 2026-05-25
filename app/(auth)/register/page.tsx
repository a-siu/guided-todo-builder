"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { RegisterForm } from "@/components/RegisterForm";
import Link from "next/link";

export default function RegisterPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.push("/");
    }
  }, [status, router]);

  if (status === "loading") return null;

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-sm border border-primary-100 p-8">
          <div className="text-center mb-8">
            <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center mx-auto mb-4">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-primary-900">Create account</h1>
            <p className="text-sm text-primary-400 mt-1">Start organizing your tasks</p>
          </div>
          <RegisterForm />
        </div>
        <p className="text-center text-sm text-primary-400 mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-primary-600 hover:text-primary-700 font-medium transition-colors duration-150">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
