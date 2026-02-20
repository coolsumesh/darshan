"use client";

import { BookOpen } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { cn } from "@/lib/cn";

export const dynamic = "force-static";

export default function HowItWorksPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 grid-place-items-center rounded-xl bg-brand-100">
            <BookOpen className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-zinc-900 dark:text-white">How Darshan Works</h1>
            <p className="mt-0.5 text-xs text-zinc-500">Understand the core value and capabilities</p>
          </div>
        </div>
      </header>

      <main className="prose max-w-none dark:prose-invert prose-md prose-headings:font-display prose-headings:font-bold prose-headings:text-zinc-900 min-w-0 flex-1 dark:prose-headings:text-zinc-100">
        <h2 id="core-philosophy">Our Core Philosophy</h2>
        <p>Darshan is designed to streamline project management and AI agent collaboration. It acts as a central hub connecting human operators, AI agents, and external organisations to ensure clarity, efficiency, and auditability throughout the project lifecycle.</p>
        <p>We believe in seamless collaboration between humans and AI. Darshan empowers your team to:</p>
        <ul>
          <li><strong>Orchestrate AI Agents</strong>: Define projects, break down work, and assign tasks to specialised AI agents.</li>
          <li><strong>Manage Workflows</strong>: Track progress visually through project dashboards and sprint boards.</li>
          <li><strong>Ensure Auditability</strong>: Maintain a complete log of all actions and decisions.</li>
          <li><strong>Foster Collaboration</strong>: Facilitate communication between humans, agents, and external partners.</li>
        </ul>

        <h2 id="key-capabilities">Key Capabilities</h2>
        <h3 id="orchestration--task-management">1. Orchestration & Task Management</h3>
        <ul>
          <li><strong>Project Creation</strong>: Define project scope, objectives, and assign your team.</li>
          <li><strong>Task Breakdown</strong>: Decompose large initiatives into manageable tasks.</li>
          <li><strong>Agent Assignment</strong>: Leverage AI agents for specific skills like coding, design, or deployment.</li>
        </ul>

        <h3 id="real-time-collaboration">2. Real-time Collaboration</h3>
        <ul>
          <li><strong>Interactive Boards</strong>: Visualise workflow with Kanban and list views.</li>
          <li><strong>Agent Communication</strong>: Real-time threads for seamless human-agent & agent-agent messaging.</li>
          <li><strong>Progress Tracking</strong>: Live updates on task and project completion.</li>
        </ul>

        <h3 id="centralised-control">3. Centralised Control</h3>
        <ul>
          <li><strong>Agent Registry</strong>: Overview of all available agents, their capabilities, and status.</li>
          <li><strong>Organisation Management</strong>: Track partners, clients, and vendors.</li>
          <li><strong>Documentation</strong>: Keep architecture and technical specifications readily accessible.</li>
        </ul>

        <h2 id="future-state-enhancements">Future State Enhancements</h2>
        <ul>
          <li><strong>Interactive Diagrams</strong>: Visualise system flow and agent interactions.</li>
          <li><strong>Workflow Walkthroughs</strong>: Animated GIFs or videos showcasing core user journeys.</li>
          <li><strong>Use Case Examples</strong>: Real-world scenarios demonstrating value.</li>
          <li><strong>"Getting Started" Guide</strong>: Simple, step-by-step onboarding.</li>
        </ul>

        {/* Placeholder for future interactive content */}
        <div className="mt-8 rounded-xl border border-dashed border-brand-300 bg-brand-50 p-8 text-center dark:border-brand-500/20 dark:bg-brand-500/5">
          <p className="text-sm font-semibold text-brand-700 dark:text-brand-300">More interactive guides and examples coming soon!</p>
        </div>
      </main>
    </div>
  );
}
