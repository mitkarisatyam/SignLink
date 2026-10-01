# ml_experiment/test_env.py
import sys
print("1. Python started", flush=True)

import numpy as np
print("2. NumPy imported:", np.__version__, flush=True)

import sklearn
print("3. scikit-learn imported:", sklearn.__version__, flush=True)

print("4. Importing torch...", flush=True)
import torch
print("5. PyTorch imported:", torch.__version__, flush=True)
