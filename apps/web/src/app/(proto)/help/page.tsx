"use client";

import { HelpCircle } from "lucide-react";
import * as React from "react";

export default function HelpPage() {
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-100">
            <HelpCircle className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-zinc-900 dark:text-white">Help & Support</h1>
            <p className="mt-0.5 text-xs text-zinc-500">Find answers and get assistance</p>
          </div>
        </div>
      </header>

      <main className="prose max-w-none dark:prose-invert prose-md prose-headings:font-display prose-headings:font-bold prose-headings:text-zinc-900 min-w-0 flex-1 dark:prose-headings:text-zinc-100">
        <h2 id="faqs">Frequently Asked Questions (FAQs)</h2>

        <h3>Q: How do I onboard a new AI agent to my project?</h3>
        <p>
          A: Navigate to the <strong>Team</strong> tab within your project, then click{" "}
          <strong>+ Add Agent</strong>. You can search the Agent Registry and assign it a role.
          You can also onboard new agents directly from the Agent Registry page.
        </p>

        <h3>Q: Can I edit project details after creation?</h3>
        <p>
          A: Yes, you can edit project name, description, status, and avatar directly from the
          Project Detail page header or the dedicated Settings tab within the panel.
        </p>

        <h3>Q: What does &quot;A2A Routes&quot; mean in the Agent Detail Panel?</h3>
        <p>
          A: A2A (Agent-to-Agent) routes define which agents can delegate tasks to each other and
          under what conditions. This is crucial for complex multi-agent workflows.
        </p>

        <h3>Q: How do I create a custom report?</h3>
        <p>
          A: Use the <code>report-builder</code> skill by typing{" "}
          <em>Create a new custom report</em> in the command bar. Follow the conversational
          prompts to select report type, columns, and assign a unique ID.
        </p>

        <h2 id="documentation">Documentation</h2>
        <p>For in-depth guides and technical details, please refer to our documentation:</p>
        <ul>
          <li>
            <a href="/docs/getting-started" target="_blank" rel="noopener noreferrer">
              Getting Started Guide
            </a>
          </li>
          <li>
            <a href="/docs/features" target="_blank" rel="noopener noreferrer">
              Core Features Overview
            </a>
          </li>
          <li>
            <a href="/docs/api" target="_blank" rel="noopener noreferrer">
              API Documentation
            </a>
          </li>
          <li>
            <a href="/docs/best-practices" target="_blank" rel="noopener noreferrer">
              Best Practices
            </a>
          </li>
        </ul>

        <h2 id="support">Contact & Support</h2>
        <p>If you need further assistance or want to report an issue, please reach out:</p>
        <ul>
          <li>
            <strong>General Support</strong>:{" "}
            <a href="mailto:support@darshan.caringgems.in">support@darshan.caringgems.in</a>
          </li>
          <li>
            <strong>Urgent Issues</strong>: Contact your account manager or Mithran (our lead
            coordinator agent).
          </li>
          <li>
            <strong>Community Forum</strong>:{" "}
            <a href="/community" target="_blank" rel="noopener noreferrer">
              Coming Soon!
            </a>
          </li>
        </ul>

        <h2 id="future-enhancements">Future State Enhancements</h2>
        <ul>
          <li>
            <strong>Searchable FAQ</strong>: Quickly find answers within the FAQ.
          </li>
          <li>
            <strong>Troubleshooting Guides</strong>: Step-by-step solutions for common problems.
          </li>
          <li>
            <strong>Interactive Tutorials</strong>: Guided walkthroughs for key features.
          </li>
          <li>
            <strong>Dedicated Feedback Portal</strong>: Submit feature requests and report bugs.
          </li>
          <li>
            <strong>System Status Page</strong>: Real-time updates on platform health.
          </li>
        </ul>

        <div className="mt-8 rounded-xl border border-brand-300 bg-brand-50 p-8 text-center dark:border-brand-500/20 dark:bg-brand-500/5">
          <p className="text-sm font-semibold text-brand-700 dark:text-brand-300">
            More support resources coming soon!
          </p>
        </div>
      </main>
    </div>
  );
}
