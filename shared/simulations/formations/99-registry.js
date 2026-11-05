    /* ---------- Register Hub & Domain Formations ---------- */
    registerFormation("hub:intro", LaniakeaFormation);
    registerFormation("hub:domain-math", MathematicsFormation);
    registerFormation("hub:domain-physics", BlackHoleFormation);
    registerFormation("hub:domain-datascience", DataScienceFormation);
    registerFormation("hub:domain-quant", QuantCrystalFormation);
    registerFormation("hub:domain-cs", QuantumCSFormation);
    registerFormation("hub:contact", EarthMoonContactFormation);

    // Sub-page domain hero & project mappings
    registerFormation("domain:math:0", MathematicsFormation);
    registerFormation("domain:math:1", MobiusFormation);
    registerFormation("domain:math:2", FourierFormation);
    registerFormation("domain:math:3", EarthMoonContactFormation);
    registerFormation("domain:physics:0", BlackHoleFormation);
    registerFormation("domain:physics:1", NBodyFormation);
    registerFormation("domain:physics:2", SchrodingerFormation);
    registerFormation("domain:physics:3", EarthMoonContactFormation);
    registerFormation("domain:datascience:0", DataScienceFormation);
    registerFormation("domain:datascience:1", DataScienceFormation);
    registerFormation("domain:datascience:2", DataScienceFormation);
    registerFormation("domain:datascience:3", EarthMoonContactFormation);
    registerFormation("domain:quant:0", QuantCrystalFormation);
    registerFormation("domain:quant:1", QuantCrystalFormation);
    registerFormation("domain:quant:2", QuantCrystalFormation);
    registerFormation("domain:quant:3", EarthMoonContactFormation);
    registerFormation("domain:cs:0", QuantumCSFormation);
    registerFormation("domain:cs:1", QuantumCSFormation);
    registerFormation("domain:cs:2", QuantumCSFormation);
    registerFormation("domain:cs:3", EarthMoonContactFormation);
    registerFormation("default", LorenzFormation);

    const createFormation = (simKey, sectionIndex, params = {}) => {
        const origin = sectionOrigin(sectionIndex);
        let Ctor = registry.get(simKey);
        if (!Ctor && typeof simKey === "string") {
            if (simKey.includes("mobius")) Ctor = MobiusFormation;
            else if (simKey.includes("fourier")) Ctor = FourierFormation;
            else if (simKey.includes("nbody")) Ctor = NBodyFormation;
            else if (simKey.includes("schrodinger")) Ctor = SchrodingerFormation;
            else if (simKey.includes("math")) Ctor = MathematicsFormation;
            else if (simKey.includes("physics")) Ctor = BlackHoleFormation;
            else if (simKey.includes("datascience") || simKey.includes("regression") || simKey.includes("spectral") || simKey.includes("papers")) Ctor = DataScienceFormation;
            else if (simKey.includes("quant") || simKey.includes("options") || simKey.includes("stat-arb")) Ctor = QuantCrystalFormation;
            else if (simKey.includes("cs") || simKey.includes("ku-lang") || simKey.includes("8bit")) Ctor = QuantumCSFormation;
            else if (simKey.includes("contact")) Ctor = EarthMoonContactFormation;
        }
        Ctor = Ctor || LorenzFormation;
        return new Ctor(origin, simKey, params, sectionIndex);
    };

        return {
        LOOK,
        Formation,
        LorenzFormation,
        MathematicsFormation,
        MobiusFormation,
        FourierFormation,
        BlackHoleFormation,
        NBodyFormation,
        SchrodingerFormation,
        DataScienceFormation,
        QuantCrystalFormation,
        QuantumCSFormation,
        EarthMoonContactFormation,
        registerFormation,
        createFormation,
        registry
    };