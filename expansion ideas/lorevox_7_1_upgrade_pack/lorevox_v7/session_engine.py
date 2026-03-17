
class SessionEngine:
    def __init__(self):
        self.pass_stage = "pass1"
        self.era = None

    def next_step(self):
        if self.pass_stage == "pass1":
            return "collect_dob"
        if self.pass_stage == "pass2a":
            return "walk_timeline"
        if self.pass_stage == "pass2b":
            return "deepen_scene"

    def advance(self):
        if self.pass_stage == "pass1":
            self.pass_stage = "pass2a"
        elif self.pass_stage == "pass2a":
            self.pass_stage = "pass2b"
