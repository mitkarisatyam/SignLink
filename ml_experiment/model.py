# ml_experiment/model.py
import torch
import torch.nn as nn
import torch.nn.functional as F

class SignTemporalGRU(nn.Module):
    """
    Lightweight Temporal GRU for real-time sign language recognition.
    Processes sequential 3D landmark features over time.
    """
    def __init__(self, input_dim=151, hidden_dim=64, num_layers=2, num_classes=6, dropout=0.25):
        super().__init__()
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.num_layers = num_layers
        self.num_classes = num_classes

        # Temporal recurrent encoder
        self.gru = nn.GRU(
            input_size=input_dim,
            hidden_size=hidden_dim,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0
        )

        # Classifier head over last state + temporal global average pooling
        self.classifier = nn.Sequential(
            nn.Linear(hidden_dim * 2, 48),
            nn.BatchNorm1d(48),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(48, num_classes)
        )

    def forward(self, x):
        # x: (batch_size, seq_len, input_dim)
        gru_out, h_n = self.gru(x)
        
        # Last step feature + Mean-pooled feature across sequence
        last_step = gru_out[:, -1, :]
        mean_pool = torch.mean(gru_out, dim=1)
        
        combined = torch.cat([last_step, mean_pool], dim=-1)
        logits = self.classifier(combined)
        return logits

    def predict_proba(self, x):
        with torch.no_grad():
            logits = self.forward(x)
            return F.softmax(logits, dim=-1)
