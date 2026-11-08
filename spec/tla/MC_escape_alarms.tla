---------------------------- MODULE MC_escape_alarms ----------------------------
(* Liveness: from every state the implementation reached (model "alarms"), a pilot who keeps tapping STEP, waits,   *)
(* unplugs the USB drive and powers on always gets back to the scan (AUTO or MANUAL).                         *)
EXTENDS EDMCore, ImplGraph_alarms

MCAlarmPri == <<"OILH", "BATL">>
MCItems == <<"FUEL", "RATE", "OATU", "EGT1", "HPQ", "KF", "ACCUM", "GPSC", "DUMP", "END">>
MCInputs == {"StepTap", "LfTap", "StepHold5", "BothHold5", "Timer", "TwoMin", "PowerOn", "PowerOff", "Raise", "Clear", "Expire", "Record", "OffEnds", "SnapEnds"}
MCFF == TRUE

EscapeInit == st \in {ImplState[i] : i \in ImplExplored}
EscapeSpec == EscapeInit /\ [][PilotNext]_st /\ WF_st(PilotNext)
=============================================================================
