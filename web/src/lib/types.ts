// Mirrors api/trend_atlas/service.py. Null means "unavailable", never zero.

export type EvidenceState =
  | 'supported_increase'
  | 'supported_decrease'
  | 'inconclusive'
  | 'insufficient_data'
  | 'no_spatial_coverage'
  | 'degenerate_variance'

export interface Bounds { west: number; south: number; east: number; north: number }
export interface Region {
  id: string
  label: string
  kind: 'published_band' | 'box' | 'regional_export'
  bounds: Bounds
}
export interface AnnualPoint { year: number; value: number | null }
export interface MonthlyPoint { year: number; month: number; value: number | null }

export interface Sensitivity {
  maxLags: number
  slopePerDecade: number
  ciLow: number
  ciHigh: number
  pValue: number
  state: EvidenceState
}

export interface Fit {
  state: EvidenceState
  n: number
  requestedStartYear: number
  requestedEndYear: number
  usedStartYear: number | null
  usedEndYear: number | null
  completeYears: number[]
  missingYears: number[]
  contiguous: boolean | null
  inferenceAvailable: boolean
  descriptiveOnly: boolean
  reason: string | null
  slopePerDecade: number | null
  ciLow: number | null
  ciHigh: number | null
  pValue: number | null
  centerYear: number | null
  valueAtCenter: number | null
  fitted: AnnualPoint[] | null
  sensitivity: Sensitivity[] | null
  sensitiveToMethod: boolean | null
  residualLag1Autocorrelation: number | null
}

export interface Coverage {
  fraction: number | null
  known: boolean
  note: string
  eligibleCells?: number
  touchedCells?: number
  threshold?: number
}

export interface RegionResult {
  region: Region
  annualSeries: AnnualPoint[]
  monthlySeries: MonthlyPoint[] | null
  coverage: Coverage
  fit: Fit
  statement: string
}

export interface PairedResult {
  label: string
  annualSeries: AnnualPoint[]
  fit: Fit
  differenceOfSlopesCheck: number | null
  statement: string
}

export interface SourceInfo { name: string; url: string; info: string; citation: string; doi?: string }

export interface DatasetSummary {
  datasetId: string
  title: string
  shortTitle: string
  productVersion: string
  variable: string
  unit: string
  rateUnit: string
  digits: number
  baseline: string | null
  resolution: string
  source: SourceInfo
  snapshotId: string
  snapshotNote: string
  aggregation: string
  transformations: string[]
  marks: string
  dataKind: string
  monthlyUnit?: string
}

export interface Dataset extends DatasetSummary {
  status: 'available' | 'unavailable'
  statusReason?: string
  group: 'Atmosphere' | 'Water' | 'Land'
  noun: string
  period: { startYear: number; endYear: number }
  defaultWindow: { startYear: number; endYear: number }
  timeResolution: string
  supportedRegions: Region[]
  customRegions: boolean
  defaultRegions: string[]
  availableLayers: Layer[]
  mapContextDataset: string | null
  hasMonthly: boolean
  capabilityNotes: string[]
}

export interface Method {
  version: string
  model: string
  covariance: string
  primaryMaxLags: number
  sensitivityMaxLags: number[]
  alpha: number
  intervalLevel: number
  minContiguousYearsForInference: number
  intervalMeaning: string
  library: string
}

export interface AnalysisResponse {
  queryKey: string
  methodVersion: string
  method: Method
  dataset: DatasetSummary
  request: { datasetId: string; startYear: number; endYear: number; regions: string[] }
  exploratory: boolean
  exploratoryNote: string | null
  regions: RegionResult[]
  paired: PairedResult | null
}

export type Projection = 'globe' | 'mercator'
export type Mode = 'explore' | 'analyze'
export type Layer = 'observed' | 'trend'
