'use client';

import Link from 'next/link';
import { Lock, Shield, TrendingUp, Users, Globe, Sparkles, Star } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Banner */}
      <div className="bg-blue-600 text-white text-center py-2.5 text-sm font-medium">
        ✨ Use Nova SDK and NEAR Private AI
      </div>

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-blue-600 rounded-full flex items-center justify-center">
                <span className="text-white font-semibold text-lg">P</span>
              </div>
              <span className="text-xl font-semibold text-gray-900">Privy Finance</span>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="px-5 py-2 text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
              >
                Login
              </Link>
              <Link
                href="/signup"
                className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-full hover:bg-gray-800 transition-colors"
              >
                Sign Up →
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="px-6 lg:px-8 py-20">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left Content */}
            <div>
              <div className="inline-block px-3 py-1 bg-blue-50 text-blue-600 text-xs font-semibold rounded-full mb-6">
                TRY IT NOW!
              </div>
              <h1 className="text-6xl lg:text-7xl font-bold text-gray-900 mb-6 leading-tight">
                Change the way you use your{' '}
                <span className="italic text-blue-600">finances</span>
              </h1>
              <p className="text-lg text-gray-600 mb-8 leading-relaxed max-w-lg">
                From your everyday spending, to planning for your future with savings and investments, Privy helps you get more from your money.
              </p>
              <div className="flex items-center gap-4">
                <Link
                  href="/login"
                  className="px-8 py-3.5 bg-gray-900 text-white font-medium rounded-full hover:bg-gray-800 transition-colors"
                >
                  Get Started Now
                </Link>
               
              </div>
            </div>

            {/* Right Bento Grid */}
            <div className="grid grid-cols-2 gap-4">
              {/* Top Left - Phone Mockup */}
              <div className="bg-gray-200 rounded-3xl p-8 flex items-center justify-center aspect-square">
                <div className="bg-white rounded-2xl shadow-xl p-6 w-40 h-64 flex flex-col">
                  <div className="flex-1 bg-gray-100 rounded-lg mb-4"></div>
                  <div className="space-y-2">
                    <div className="h-2 bg-gray-200 rounded"></div>
                    <div className="h-2 bg-gray-200 rounded w-3/4"></div>
                  </div>
                </div>
              </div>

              {/* Top Right - Currency Stat */}
              <div className="bg-blue-50 rounded-3xl p-8 flex flex-col items-center justify-center aspect-square">
                <div className="text-5xl font-bold text-gray-900 mb-2">100%</div>
                <div className="text-sm font-medium text-gray-600">Private</div>
                <div className="mt-6">
                  <Globe className="w-12 h-12 text-gray-400" />
                </div>
              </div>

              {/* Bottom Left - Sparkle Decoration */}
              <div className="bg-white rounded-3xl p-8 flex items-center justify-center aspect-square border border-gray-200">
                <div className="relative">
                  <Sparkles className="w-16 h-16 text-blue-600" />
                  <Sparkles className="w-8 h-8 text-blue-400 absolute -top-2 -right-2" />
                </div>
              </div>

              {/* Bottom Right - Stats Card */}
              <div className="bg-gray-900 rounded-3xl p-6 flex flex-col justify-between aspect-square">
                <div>
                  <div className="text-3xl font-bold text-white mb-1">$196,000</div>
                  <div className="flex items-center gap-2 mb-4">
                    <Users className="w-4 h-4 text-gray-400" />
                    <span className="text-xs text-gray-400">Users Active</span>
                  </div>
                  <div className="flex -space-x-2">
                    <div className="w-8 h-8 rounded-full bg-blue-500 border-2 border-gray-900"></div>
                    <div className="w-8 h-8 rounded-full bg-purple-500 border-2 border-gray-900"></div>
                    <div className="w-8 h-8 rounded-full bg-pink-500 border-2 border-gray-900"></div>
                    <div className="w-8 h-8 rounded-full bg-gray-700 border-2 border-gray-900 flex items-center justify-center text-white text-xs">
                      +4
                    </div>
                  </div>
                </div>
                <div className="h-20 flex items-end">
                  <svg className="w-full h-full" viewBox="0 0 100 40" preserveAspectRatio="none">
                    <polyline
                      points="0,35 20,30 40,32 60,20 80,15 100,10"
                      fill="none"
                      stroke="white"
                      strokeWidth="2"
                    />
                  </svg>
                </div>
                <div className="text-xs text-gray-400 mt-2">Saving</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Logos */}
      <section className="px-6 lg:px-8 py-16 border-y border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between gap-8 flex-wrap opacity-40">
            <div className="text-xl font-bold text-gray-900">NEAR Protocol</div>
            <div className="text-xl font-bold text-gray-900">NOVA Storage</div>
            <div className="text-xl font-bold text-gray-900">NEAR AI</div>
            <div className="text-xl font-bold text-gray-900">TEE Cloud</div>
            <div className="text-xl font-bold text-gray-900">Supabase</div>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="px-6 lg:px-8 py-20">
        <div className="max-w-4xl mx-auto text-center">
          <div className="text-xs font-semibold text-gray-500 tracking-wider mb-4">ABOUT US</div>
          <h2 className="text-5xl font-bold text-gray-900 mb-6">
            One app for all your
            <br />
            <span className="italic text-blue-600">money things</span>
          </h2>
          <p className="text-lg text-gray-600 leading-relaxed max-w-2xl mx-auto">
            Privy Finance combines the power of AI with enterprise-grade encryption to give you complete control over your financial data. Built on NEAR Protocol's private cloud infrastructure.
          </p>
        </div>
      </section>

      {/* Features Grid */}
      <section className="px-6 lg:px-8 py-20 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Lock className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">End-to-End Encryption</h3>
              <p className="text-gray-600">
                Your documents are encrypted on NOVA. We never see your raw financial data.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Shield className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">TEE Processing</h3>
              <p className="text-gray-600">
                AI analysis happens in trusted execution environments on NEAR AI Cloud.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <TrendingUp className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Smart Insights</h3>
              <p className="text-gray-600">
                Get personalized recommendations with impact scores and savings potential.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}