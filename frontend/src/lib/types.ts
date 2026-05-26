export type Slide = {
  id: string;
  filename: string;
  file_size_bytes: number | null;
  width: number | null;
  height: number | null;
  magnification: number | null;
  vendor: string | null;
  status: string;
  tile_count: number;
  thumbnail_path: string | null;
  created_at: string;
};

export type Patch = {
  id: string;
  slide_id: string;
  x: number;
  y: number;
  level: number;
  magnification: number | null;
  tissue_fraction: number | null;
  created_at: string;
};

export type Classifier = {
  id: string;
  name: string;
  description: string | null;
  class_names: string[];
  n_classes: number;
  n_training_samples: number | null;
  label_source: string | null;
  metrics: {
    auc?: number;
    roc_data?: { fpr: number[]; tpr: number[] };
    confusion_matrix?: number[][];
    classification_report?: Record<string, any>;
    class_distribution?: Record<string, number>;
  } | null;
  status: string;
  created_at: string;
};

export type InferenceJob = {
  id: string;
  slide_id: string;
  classifier_id: string;
  status: string;
  progress_current: number;
  progress_total: number;
  summary: {
    total_patches?: number;
    class_distribution?: Record<string, number>;
    class_names?: string[];
  } | null;
  created_at: string;
  completed_at: string | null;
};

export type PatchPrediction = {
  id: string;
  patch_id: string;
  predicted_class: number;
  predicted_label: string;
  probabilities: number[];
};

export type PatchCoordinate = {
  id: string;
  x: number;
  y: number;
};

export type LabelSummary = {
  slide_id: string;
  total_labeled: number;
  counts: Record<string, number>;
};

export type UncertainPatch = {
  patch_id: string;
  x: number;
  y: number;
  max_probability: number;
  predicted_label: string;
};
