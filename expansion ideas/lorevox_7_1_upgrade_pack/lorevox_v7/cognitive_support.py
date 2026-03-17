
class CognitiveSupport:
    def __init__(self):
        self.mode = "open"

    def update(self, signals):
        if signals.get("confusion"):
            self.mode = "recognition"
        elif signals.get("fatigue"):
            self.mode = "gentle"
        else:
            self.mode = "open"

    def transform_prompt(self, prompt):
        if self.mode == "recognition":
            return "Was that before or after " + prompt
        return prompt
