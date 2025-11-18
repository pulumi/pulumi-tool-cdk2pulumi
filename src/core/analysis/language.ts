import { AssemblyManifest } from 'aws-cdk-lib/cloud-assembly-schema';
import {
  AnalysisLanguage,
  DetectionConfidence,
  LanguageDetectionResult,
  LanguageDetectionSignal,
} from './types';

const LANGUAGE_LIBRARY_HINTS: Record<AnalysisLanguage, RegExp[]> = {
  typescript: [/typescript/i, /ts-node/i],
  javascript: [/aws-cdk-lib/i],
  python: [/python/i, /aws-cdk-lib:python/i],
  java: [/maven/i, /gradle/i],
  csharp: [/amazon\.jsii-runtime\/dotnet/i, /AWSSDK/i],
  unknown: [],
};

const LANGUAGE_ASSET_EXTENSIONS: Record<AnalysisLanguage, string[]> = {
  typescript: ['.ts', '.tsx'],
  javascript: ['.js', '.jsx'],
  python: ['.py'],
  java: ['.java'],
  csharp: ['.cs'],
  unknown: [],
};

export interface LanguageDetectionOptions {
  readonly manifest: AssemblyManifest;
  readonly assetFileExtensions?: string[];
}

/**
 * Performs a best-effort inference of the CDK app language.
 */
export function detectLanguage(
  options: LanguageDetectionOptions,
): LanguageDetectionResult {
  const { manifest, assetFileExtensions = [] } = options;
  const signals = new Map<AnalysisLanguage, LanguageDetectionSignal[]>();
  const libraries = Object.keys(manifest.runtime?.libraries ?? {});

  for (const [language, patterns] of Object.entries(LANGUAGE_LIBRARY_HINTS) as [
    AnalysisLanguage,
    RegExp[],
  ][]) {
    for (const pattern of patterns) {
      const match = libraries.find((lib) => pattern.test(lib));
      if (!match) {
        continue;
      }
      recordSignal(signals, language, {
        source: 'manifestRuntime',
        detail: `Matched library '${match}'`,
      });
    }
  }

  if (signals.size === 0 && libraries.length > 0) {
    recordSignal(signals, 'javascript', {
      source: 'manifestRuntime',
      detail:
        'Detected runtime libraries but no language specific hints; defaulting to JavaScript family',
    });
  }

  for (const ext of assetFileExtensions) {
    for (const [language, extensions] of Object.entries(
      LANGUAGE_ASSET_EXTENSIONS,
    ) as [AnalysisLanguage, string[]][]) {
      if (extensions.includes(ext)) {
        recordSignal(signals, language, {
          source: 'assetMetadata',
          detail: `Observed asset extension '${ext}'`,
        });
      }
    }
  }

  const { language, signalList } = selectLanguage(signals);
  const confidence = deriveConfidence(signalList.length);

  if (signalList.length === 0) {
    return {
      language: 'unknown',
      confidence: 'low',
      signals: [
        {
          source: 'fallback',
          detail:
            'No language hints were found in the manifest or asset metadata',
        },
      ],
      notes: [
        'Language detection will improve once additional heuristics are implemented.',
      ],
    };
  }

  return {
    language,
    confidence,
    signals: signalList,
  };
}

function recordSignal(
  signals: Map<AnalysisLanguage, LanguageDetectionSignal[]>,
  language: AnalysisLanguage,
  signal: LanguageDetectionSignal,
) {
  const current = signals.get(language) ?? [];
  current.push(signal);
  signals.set(language, current);
}

function selectLanguage(
  signals: Map<AnalysisLanguage, LanguageDetectionSignal[]>,
) {
  let selected: AnalysisLanguage = 'unknown';
  let selectedSignals: LanguageDetectionSignal[] = [];

  for (const [language, signalList] of signals.entries()) {
    if (signalList.length > selectedSignals.length) {
      selected = language;
      selectedSignals = signalList;
      continue;
    }
    if (signalList.length === selectedSignals.length && signalList.length > 0) {
      if (selected === 'unknown') {
        selected = language;
        selectedSignals = signalList;
      }
    }
  }

  return { language: selected, signalList: selectedSignals };
}

function deriveConfidence(signalCount: number): DetectionConfidence {
  if (signalCount === 0) {
    return 'low';
  }
  if (signalCount === 1) {
    return 'medium';
  }
  return 'high';
}
