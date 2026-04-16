import { performance } from "node:perf_hooks";

import { convert } from "../src/index.js";

interface BenchmarkCase {
  html: string;
  iterations: number;
  name: string;
}

function buildLargeDocument(repeats: number): string {
  const sections: string[] = [];

  for (let index = 0; index < repeats; index += 1) {
    sections.push(`
      <section>
        <h2>Section ${index + 1}</h2>
        <p>This is paragraph ${index + 1} with <strong>rich</strong> content.</p>
        <details>
          <summary>More ${index + 1}</summary>
          <p>Nested details body ${index + 1}</p>
        </details>
        <pre><code class="language-js">console.log(${index});\n</code></pre>
      </section>
    `);
  }

  return sections.join("\n");
}

function benchmarkCase({ name, html, iterations }: BenchmarkCase): void {
  const startedAt = performance.now();

  for (let index = 0; index < iterations; index += 1) {
    convert(html);
  }

  const duration = performance.now() - startedAt;
  const average = duration / iterations;

  console.log(`${name}: ${duration.toFixed(2)}ms total, ${average.toFixed(2)}ms avg`);
}

const cases: BenchmarkCase[] = [
  {
    name: "small",
    iterations: 2000,
    html: "<p>Hello <strong>world</strong></p>",
  },
  {
    name: "medium",
    iterations: 300,
    html: buildLargeDocument(20),
  },
  {
    name: "large",
    iterations: 60,
    html: buildLargeDocument(120),
  },
];

for (const benchmark of cases) {
  benchmarkCase(benchmark);
}
